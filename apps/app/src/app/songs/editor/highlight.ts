// Achordeon highlight grammar — Epic 5 ▸ subtask 4
// Spec: ADR-0010 (a CodeMirror stream parser, not a Lezer grammar);
// docs/PARSER-GRAMMAR.md (the rules this must agree with)

import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { Tag } from '@lezer/highlight';
import {
  ESCAPABLE,
  findClosingBracket,
  findLabelDelimiter,
  splitChordTokens,
  unescape,
  type ChordTheory,
} from '@achordeon/shared/domain';

/**
 * Our token tags. Defined rather than borrowed from `@lezer/highlight`'s standard
 * set (`heading`, `labelName`, …) because these are Achordeon's parts of speech,
 * not a programming language's: a chord is not a keyword and an annotation is not
 * a comment. Naming them for what they are keeps the theme readable.
 */
export const achordeonTags = {
  title: Tag.define(),
  subtitle: Tag.define(),
  label: Tag.define(),
  /** A transposable chord. */
  chord: Tag.define(),
  /** A bracket that is not a chord — `[Solo]`, `[x2]` — rendered verbatim. */
  annotation: Tag.define(),
  escape: Tag.define(),
};

/**
 * Where the chord-bearing bracket we are inside ends, or null.
 *
 * The parser is line-oriented but a bracket is read in several tokens, so the
 * position of its `]` has to survive between `token()` calls. A bracket never
 * spans lines (`findClosingBracket` searches the current line only), so this is
 * always cleared by the time the next line starts.
 */
interface HighlightState {
  bracketEnd: number | null;
}

/**
 * **Colouring only, and strictly local** (ADR-0010). Cross-document facts — which
 * of three titles is the effective one — are `ParserService`'s, and arrive as
 * markers. A highlighter that tried to know them would be a second parser, drifting
 * against the first.
 *
 * It is line-oriented because the grammar is (PARSER-GRAMMAR §Phase 1), which is
 * exactly why a stream parser fits and a full Lezer grammar would be weight for
 * nothing. Chord validity comes from the injected `ChordTheory` port — the same
 * one the real parser uses, so `[Solo]` cannot look like a chord here and read as
 * an annotation there, and a token inside a bracket is judged by the same rule
 * that decides whether the parser will transpose it.
 */
export function achordeonHighlight(
  theory: ChordTheory,
): StreamLanguage<HighlightState> {
  /** Escapes are resolved before validating, exactly as the parser does before
   * it sets `valid` — otherwise the two would be judging different strings. */
  const isChordToken = (token: string): boolean =>
    theory.parseChord(unescape(token)) !== null;

  const parser: StreamParser<HighlightState> = {
    name: 'achordeon',

    startState: () => ({ bracketEnd: null }),
    copyState: (state) => ({ bracketEnd: state.bracketEnd }),

    token(stream, state) {
      // A bracket never spans lines, so a live `bracketEnd` at the start of one
      // is stale — an offset into the previous line's text. Dropping it here
      // stops that ever being read against the wrong string.
      if (stream.sol()) {
        state.bracketEnd = null;
      }

      // --- inside a chord-bearing bracket: one token at a time (§Chord validity) ---
      //
      // The whole bracket used to take a single colour, which forced a choice
      // between two lies: `every` greyed out `[||\:Em,G,Em,A:||]` even though it
      // really does carry Em, G and A, and `some` painted the repeat signs as if
      // they were chords. Neither is what is on the line. Reading it token by
      // token says exactly what the parser will do — the chords are chords, the
      // brackets belong to them, and the `||:` between them is just text.
      if (state.bracketEnd !== null) {
        if (stream.pos >= state.bracketEnd) {
          state.bracketEnd = null;
          stream.next(); // the closing `]`
          return 'chord';
        }
        // Separators carry no meaning of their own and stay unstyled.
        if (stream.eatWhile(/[\s,]/)) {
          return null;
        }
        const start = stream.pos;
        while (
          stream.pos < state.bracketEnd &&
          !/[\s,]/.test(stream.peek() ?? '')
        ) {
          stream.next();
        }
        const token = stream.string.slice(start, stream.pos);
        return isChordToken(token) ? 'chord' : null;
      }

      // --- column 0: the line-type markers (Phase 1) ---
      if (stream.sol()) {
        // Longest match first: `** x` is a subtitle, never a title with a `*` body.
        if (stream.match(/^\*\* .*/)) {
          return 'subtitle';
        }
        if (stream.match(/^\* .*/)) {
          return 'title';
        }
        // The label delimiter is a colon-run followed by space-or-EOL; anything
        // else (`http://x`, `12:30`) is ordinary lyric. Reusing the parser's own
        // recogniser is what keeps that agreement honest.
        const delimiter = findLabelDelimiter(stream.string);
        if (delimiter !== -1) {
          stream.pos = delimiter + 1; // include the delimiting colon
          return 'label';
        }
      }

      // --- inside a content line: escapes and brackets (Phase 2) ---
      const char = stream.peek();

      if (char === '\\') {
        stream.next();
        const next = stream.peek();
        if (next !== undefined && ESCAPABLE.has(next)) {
          stream.next();
          return 'escape';
        }
        return null; // a lone backslash is literal text
      }

      if (char === '[') {
        const close = findClosingBracket(stream.string, stream.pos);
        if (close === -1) {
          stream.next();
          return null; // unterminated — a literal bracket, not a chord
        }
        const inner = stream.string.slice(stream.pos + 1, close);
        // A bracket with no chord at all is a verbatim annotation — `[Solo]`,
        // `[x2]` — and colours as one whole thing, because there is nothing
        // inside it to tell apart.
        if (!splitChordTokens(inner).some(isChordToken)) {
          stream.pos = close + 1;
          return 'annotation';
        }
        // Otherwise the bracket is chord-bearing and gets read token by token
        // (see `bracketEnd`). The opening bracket is punctuation of the chord.
        state.bracketEnd = close;
        stream.next();
        return 'chord';
      }

      // Ordinary text: consume to the next thing that could matter.
      stream.next();
      stream.eatWhile(/[^\\[]/);
      return null;
    },

    tokenTable: {
      title: achordeonTags.title,
      subtitle: achordeonTags.subtitle,
      label: achordeonTags.label,
      chord: achordeonTags.chord,
      annotation: achordeonTags.annotation,
      escape: achordeonTags.escape,
    },
  };

  return StreamLanguage.define(parser);
}
