// Parser Phase 2 — inline scan ("the tokenizer") — Epic 2 ▸ subtask 4
// Spec: docs/PARSER-GRAMMAR.md §Phase 2. Runs only over the content portion of
// content lines (never title/subtitle/label text). Builds a clean `text` with
// chords overlaid by index; resolves escapes; treats invalid brackets as
// verbatim annotations, not literal text.

import type { Line } from './ast';
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
 */
export function scanContent(content: string, theory: ChordTheory): Line {
  let text = '';
  const chords: Line['chords'] = [];

  let i = 0;
  while (i < content.length) {
    const c = content[i];

    if (c === '\\' && i + 1 < content.length && ESCAPABLE.has(content[i + 1])) {
      text += content[i + 1]; // consume the backslash; keep the char literal
      i += 2;
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

  return { text, chords };
}
