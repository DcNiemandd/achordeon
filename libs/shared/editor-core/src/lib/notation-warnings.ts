// Notation-mismatch scan — the "wrong alphabet for this setting" underline
// Spec: docs/NOTATION-PLAN.md §5 (the warning), ADR-0010 (local, colouring-grade
// knowledge only). The mirror image of verbatim-brackets.ts: that file marks the
// tokens the theory reads no chord in, this one marks the chords whose *spelling*
// belongs to the notation the song is not set to.

import {
  findClosingBracket,
  findClosingDoubleBracket,
  unescape,
  type ChordNotation,
  type ChordTheory,
} from '@achordeon/shared/domain';

/** A chord spelled in the notation the song is not set to, in editor coordinates. */
export interface NotationSpan {
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
 * The note letter each setting reads as the *other* alphabet, as a leading root
 * or a `/`-bass — the two halves `toEnglishNotation` rewrites, read backwards.
 *
 * Reading is unconditional (chords.ts): a leading `H` and a `/H` are always B
 * natural, so under `english` an `H` is a German name in an English song. Under
 * `german` — where a printed B natural is `H` and a printed `B` is B♭ — a source
 * `B` reads as B natural, and a German reader who wrote it meaning B♭ is a
 * semitone up with nothing said. So a bare `B` (root or bass) is the trap.
 *
 * **But `Bb` is not**, and this is the asymmetry with the `H` side. B♭ is written
 * `Bb` in either notation (nobody writes `Bb` for a double flat — NOTATION-PLAN
 * §3), it reads as B♭ everywhere, and it is exactly what a German *should* type
 * for the note that prints `B`. A flat after the `B` settles the pitch, so the
 * pattern refuses a following `b`; the `H` side needs no such guard because an
 * `H` is the foreign letter whatever accidental trails it.
 */
const FOREIGN: Record<ChordNotation, RegExp> = {
  english: /(^|\/)H/,
  german: /(^|\/)B(?!b)/,
};

/**
 * Split a bracket's inner text on spaces/commas, keeping each token's offset —
 * the same split `findVerbatimSpans` repeats and for the same reason: the
 * position IS the answer, and two ideas of where a token ends would underline the
 * wrong characters. `splitChordTokens` throws the offsets away.
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
 * Every chord in `content` whose root or bass is spelled in the notation the song
 * is *not* set to — a German `H` in an English song, or an English `B` in a
 * German one.
 *
 * **Beside the parser, never in it** (NOTATION-PLAN §5). A parser that took the
 * setting would make `ast.warnings` depend on a preference, and the same file
 * would underline differently on two devices. This reads the live document with
 * the same injected `ChordTheory` the parser sets `valid` with, so the underline
 * only ever lands on a token that really is a chord — `[Bells]` and `[Half]` are
 * annotations, not a bass `B` and a root `H`.
 *
 * Token by token, like `findVerbatimSpans`: one foreign name in `[Em Am H]` is
 * the one thing worth pointing at. A chordless bracket says nothing here — a
 * spelling is only wrong if it is a chord's.
 */
export function findNotationSpans(
  content: string,
  notation: ChordNotation,
  theory: ChordTheory,
): NotationSpan[] {
  const foreign = FOREIGN[notation];
  const isChord = (token: string) =>
    theory.parseChord(unescape(token)) !== null;
  const isForeign = (token: string) => foreign.test(unescape(token));
  const out: NotationSpan[] = [];
  const lines = content.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    // A `*` line never reaches the inline scan (PARSER-GRAMMAR §Phase 1), so its
    // brackets are literal text — there is no chord there to be spelled wrong.
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
      for (const token of tokenize(text.slice(innerAt, close))) {
        if (isChord(token.text) && isForeign(token.text)) {
          out.push({
            line,
            range: [innerAt + token.at, innerAt + token.at + token.text.length],
          });
        }
      }
      i = close + markerLength;
    }
  }
  return out;
}
