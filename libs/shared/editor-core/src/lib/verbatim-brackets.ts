// Verbatim-span scan — the "this is not a chord" explanation
// Spec: docs/PARSER-GRAMMAR.md §Error/warning ("invalid chords are deliberately
// not warnings"), ADR-0010 (local, colouring-grade knowledge only)

import {
  findClosingBracket,
  findClosingDoubleBracket,
  unescape,
  type ChordTheory,
} from '@achordeon/shared/domain';

/** Text the theory recognises no chord in, in editor coordinates. */
export interface VerbatimSpan {
  /** 0-based source line. */
  readonly line: number;
  /** `[start, end)` within the line. */
  readonly range: readonly [number, number];
}

/** A token of a bracket's inner text, with where it starts in that text. */
interface Token {
  readonly text: string;
  readonly at: number;
}

/**
 * Split a bracket's inner text on spaces/commas, keeping each token's offset.
 *
 * The domain's `splitChordTokens` does the same split and throws the positions
 * away, which is all the parser needs (a bracket's chords all anchor at one
 * index). Here the position IS the answer — the whole point is pointing at the
 * one token that is wrong — so the split is repeated rather than the domain
 * bent into carrying offsets it has no use for. The separator class is copied
 * from it deliberately: two different ideas of where a token ends would put the
 * underline under the wrong characters.
 */
function tokenize(inner: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < inner.length) {
    if (/[\s,]/.test(inner[at])) {
      at += 1;
      continue;
    }
    const start = at;
    while (at < inner.length && !/[\s,]/.test(inner[at])) {
      at += 1;
    }
    tokens.push({ text: inner.slice(start, at), at: start });
  }
  return tokens;
}

/**
 * Everything in `content` that sits in a bracket and is not a chord.
 *
 * **Token by token, not bracket by bracket**, because a bracket is a row of
 * chords and one bad name in it is the whole thing worth saying: `[Em Am Gmimi]`
 * transposes the first two and leaves `Gmimi` behind, and underlining all three
 * would hide exactly the one you need to see. So a chord-bearing bracket reports
 * only its non-chord tokens.
 *
 * A bracket with **no** chord anywhere in it reports as one span instead. That is
 * a verbatim annotation — `[Solo]`, `[Guitar solo]`, `[x2]` — and it is one thing
 * with one explanation, not a list of words that each failed to be a chord.
 *
 * Both readings are the highlighter's, on purpose: `achordeonHighlight` colours a
 * chordless bracket as a single `annotation` and reads a chord-bearing one token
 * by token, asking the same injected `ChordTheory` the parser asks before it sets
 * `valid`. Colour, underline and transpose therefore cannot disagree about what a
 * chord is.
 *
 * It is **not** a parse and does not want to be (ADR-0010): nothing here is
 * cross-line or cross-document. The grammar's cross-document facts — which of
 * three titles wins — still arrive as parser warnings.
 */
export function findVerbatimSpans(
  content: string,
  theory: ChordTheory,
): VerbatimSpan[] {
  const isChord = (token: string) =>
    theory.parseChord(unescape(token)) !== null;
  const out: VerbatimSpan[] = [];
  const lines = content.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    // A `*` line never reaches the inline scan (PARSER-GRAMMAR §Phase 1), so its
    // brackets are literal text — there is no chord there to be wrong about.
    if (text.startsWith('* ') || text.startsWith('** ')) {
      continue;
    }
    let i = 0;
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2; // `\[` is a literal bracket and opens nothing
        continue;
      }
      if (text[i] !== '[') {
        i += 1;
        continue;
      }
      const isInline = text[i + 1] === '[';
      const markerLength = isInline ? 2 : 1;
      const close = isInline
        ? findClosingDoubleBracket(text, i)
        : findClosingBracket(text, i);
      if (close === -1) {
        i += 1; // unterminated: a literal `[`, not a bracket
        continue;
      }
      const innerAt = i + markerLength;
      const tokens = tokenize(text.slice(innerAt, close));
      if (tokens.some((token) => isChord(token.text))) {
        for (const token of tokens) {
          if (!isChord(token.text)) {
            out.push({
              line,
              range: [
                innerAt + token.at,
                innerAt + token.at + token.text.length,
              ],
            });
          }
        }
      } else if (tokens.length > 0) {
        // Brackets included: the annotation is the whole `[…]`, and an empty one
        // says nothing to explain.
        out.push({ line, range: [i, close + markerLength] });
      }
      i = close + markerLength;
    }
  }
  return out;
}
