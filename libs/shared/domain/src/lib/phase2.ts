// Parser Phase 2 — inline scan ("the tokenizer") — Epic 2 ▸ subtask 4
// Spec: docs/PARSER-GRAMMAR.md §Phase 2. Runs only over the content portion of
// content lines (never title/subtitle/label text). Builds a clean `text` with
// chords overlaid by index; resolves escapes; treats invalid brackets as
// verbatim annotations, not literal text; and overlays markdown EMPHASIS
// (`*i*`, `**b**`, `***bi***`) the same by-index way as chords.

import type { Line, Span } from './ast';
import {
  ESCAPABLE,
  emphasisMarkers,
  findClosingBracket,
  findClosingDoubleBracket,
  splitChordTokens,
  unescape,
} from './chords';
import type { ChordTheory } from './theory';

/**
 * Scan one content string into a `Line`. Anchors sit above the character
 * immediately after their closing bracket (chord-over-next-char); an end-of-line
 * bracket anchors at `text.length`. An unterminated `[` is a literal bracket.
 * A doubled bracket `[[…]]` is an **inline** chord group — same tokens, same
 * anchor index, but rendered in the flow rather than above the line.
 *
 * **Emphasis is a toggle over groups of `*`** (docs/PARSER-GRAMMAR §Emphasis):
 * every pair of asterisks in a group flips bold and a lone leftover one flips
 * italic, so a group of one/two/three is italic/bold/both. Which asterisks are
 * markers at all — and which are text, because nothing on the line matches them —
 * is `emphasisMarkers`' answer, taken before the scan starts because it needs the
 * whole line. Markers are consumed from `text`, so a span's indices line up with
 * the same clean `text` the chords anchor into.
 */
export function scanContent(content: string, theory: ChordTheory): Line {
  let text = '';
  const chords: Line['chords'] = [];
  const spans: Span[] = [];

  const markers = emphasisMarkers(content);

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
      // A whole run at a time would miss that one run can be part markup and part
      // text (`*asd**`), so the unit is the marker group — `markers` says where
      // one starts and how long it is, and everything else here is an asterisk.
      const group = markers.get(i);
      if (group === undefined) {
        let run = 0;
        while (content[i + run] === '*' && !markers.has(i + run)) run += 1;
        // Printed asterisks belong to whatever emphasis is in force around them.
        text += '*'.repeat(run);
        i += run;
        continue;
      }
      // Close the run that was open, then flip. Every PAIR of asterisks in the
      // group is a bold marker and a lone leftover one is italic — so one/two/
      // three read as italic/bold/both, and a longer group simply keeps going:
      // `****` is bold twice over, which emphasises nothing.
      closeSpan(text.length);
      if (Math.floor(group / 2) % 2 === 1) bold = !bold;
      if (group % 2 === 1) italic = !italic;
      if (italic || bold) styleStart = text.length;
      i += group;
      continue;
    }

    if (c === '[' && content[i + 1] === '[') {
      // An INLINE chord group: `[[Am F G]]` renders where it is written instead of
      // above the line. Tokenised exactly like a normal bracket, so `(2×)` rides
      // along as a verbatim annotation. Unterminated → the first `[` is literal
      // text and the scan resumes after it, which leaves `[[C]` reading as a
      // literal bracket plus an ordinary chord (the lone-`[` rule, one level up).
      const close = findClosingDoubleBracket(content, i);
      if (close !== -1) {
        const at = text.length;
        for (const token of splitChordTokens(content.slice(i + 2, close))) {
          const raw = unescape(token);
          chords.push({
            raw,
            at,
            valid: theory.parseChord(raw) !== null,
            inline: true,
          });
        }
        i = close + 2;
        continue;
      }
      text += '[';
      i += 1;
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

  // No end-of-line close is needed: every marker that survived pairs with another
  // of its own length, so each bit is flipped an even number of times and the last
  // marker of a pair is what closed the span.
  return spans.length > 0 ? { text, chords, spans } : { text, chords };
}
