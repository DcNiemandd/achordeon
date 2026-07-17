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
 * **Colouring only, and strictly local** (ADR-0010). Cross-document facts — which
 * of three titles is the effective one — are `ParserService`'s, and arrive as
 * markers. A highlighter that tried to know them would be a second parser, drifting
 * against the first.
 *
 * It is line-oriented because the grammar is (PARSER-GRAMMAR §Phase 1), which is
 * exactly why a stream parser fits and a full Lezer grammar would be weight for
 * nothing. Chord validity comes from the injected `ChordTheory` port — the same
 * one the real parser uses, so `[Solo]` cannot look like a chord here and read as
 * an annotation there.
 */
export function achordeonHighlight(
  theory: ChordTheory,
): StreamLanguage<unknown> {
  const parser: StreamParser<unknown> = {
    name: 'achordeon',

    token(stream) {
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
        stream.pos = close + 1;
        // One bracket may hold several chords; it colours as a chord only if every
        // token in it is one, because that is the granularity a token can carry.
        const tokens = splitChordTokens(inner);
        const isChord =
          tokens.length > 0 &&
          tokens.every((token) => theory.parseChord(token) !== null);
        return isChord ? 'chord' : 'annotation';
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
