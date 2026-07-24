// Parser Phase 2 — inline scan ("the tokenizer") — Epic 2 ▸ subtask 4
// Spec: docs/PARSER-GRAMMAR.md §Phase 2. Runs only over the content portion of
// content lines (never title/subtitle/label text). Builds a clean `text` with
// chords overlaid by index; resolves escapes; treats invalid brackets as
// verbatim annotations, not literal text; and overlays markdown EMPHASIS
// (`*i*`, `**b**`, `***bi***`) the same by-index way as chords.

import type { Line, Span } from './ast';
import {
  ESCAPABLE,
  findClosingBracket,
  splitChordTokens,
  unescape,
} from './chords';
import type { ChordTheory } from './theory';

/**
 * Scan one content string into a `Line`. Anchors sit above the character
 * immediately after their closing bracket (chord-over-next-char); an end-of-line
 * bracket anchors at `text.length`. An unterminated `[` is a literal bracket.
 *
 * **Emphasis is a toggle over runs of `*`** (docs/PARSER-GRAMMAR §Emphasis): a
 * run of one flips italic, two flips bold, three flips both; four or more is
 * literal. State that is still on at end of line closes there — an unclosed
 * emphasis emphasises to the line's end rather than being reinterpreted, and
 * `\*` is the way to write a literal asterisk. Markers are consumed from `text`,
 * so a span's indices line up with the same clean `text` the chords anchor into.
 */
export function scanContent(content: string, theory: ChordTheory): Line {
  let text = '';
  const chords: Line['chords'] = [];
  const spans: Span[] = [];

  // Emphasis state, and where the current styled run began in `text`.
  let italic = false;
  let bold = false;
  let styleStart = 0;

  const closeSpan = (end: number): void => {
    if ((italic || bold) && end > styleStart) {
      const span: Span = { start: styleStart, end };
      if (italic) span.italic = true;
      if (bold) span.bold = true;
      spans.push(span);
    }
  };

  let i = 0;
  while (i < content.length) {
    const c = content[i];

    if (c === '\\' && i + 1 < content.length && ESCAPABLE.has(content[i + 1])) {
      text += content[i + 1]; // consume the backslash; keep the char literal
      i += 2;
      continue;
    }

    if (c === '*') {
      let run = 0;
      while (content[i + run] === '*') run += 1;
      // Four or more is not an emphasis marker — the asterisks are literal.
      if (run > 3) {
        text += '*'.repeat(run);
        i += run;
        continue;
      }
      // Close the run that was open, then flip: one → italic, two → bold, three
      // → both. The span just closed carries the flags as they were.
      closeSpan(text.length);
      if (run === 1 || run === 3) italic = !italic;
      if (run === 2 || run === 3) bold = !bold;
      if (italic || bold) styleStart = text.length;
      i += run;
      continue;
    }

    if (c === '[') {
      const close = findClosingBracket(content, i);
      if (close === -1) {
        text += '['; // unterminated bracket → literal '['
        i += 1;
        continue;
      }
      const at = text.length; // the char appended next is the anchored one
      for (const token of splitChordTokens(content.slice(i + 1, close))) {
        // Resolve escapes in the token too: `[||\: …]` must render `||:`, not
        // keep the backslash the label-escape needed (see `unescape`). Validate
        // the resolved text — an escaped token is never a chord anyway.
        const raw = unescape(token);
        chords.push({ raw, at, valid: theory.parseChord(raw) !== null });
      }
      i = close + 1;
      continue;
    }

    text += c; // includes a lone `\` before a non-escapable char (kept literal)
    i += 1;
  }

  // An emphasis left open runs to the end of the line.
  closeSpan(text.length);

  return spans.length > 0 ? { text, chords, spans } : { text, chords };
}
