// Transpose — pure domain policy — Epic 2 ▸ subtask 6
// Spec: ADR-0008, PRD-DOMAIN-MODEL.md §Transpose, docs/PARSER-GRAMMAR.md.
// A destructive SOURCE rewrite (not an AST transform): shifts every valid chord
// by ±N semitones and re-spells from a fixed direction table. Everything outside
// a chord token is preserved byte-for-byte. Reuses the parser's chord sub-grammar
// (one bracket recogniser) via the injected ChordTheory port — kept pure by
// taking the port as a parameter.

import { findClosingBracket } from './chords';
import type { ChordTheory } from './theory';

// Direction-based spelling (product policy, not theory): up prefers sharps, down
// prefers flats — naturals at the boundaries, never E#/B#/Cb/Fb or doubles.
const UP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DOWN = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function transposeToken(
  token: string,
  table: readonly string[],
  semitones: number,
  theory: ChordTheory,
): string {
  const parsed = theory.parseChord(token);
  if (!parsed) {
    return token; // invalid-as-annotation ([Solo], [x2], [N.C.]) — never transposed
  }
  const rootChroma = theory.noteChroma(parsed.root);
  if (rootChroma === null) {
    return token;
  }
  let bass = '';
  if (parsed.bass !== null) {
    const bassChroma = theory.noteChroma(parsed.bass);
    if (bassChroma === null) {
      return token;
    }
    bass = '/' + table[mod12(bassChroma + semitones)];
  }
  // root + verbatim quality + /bass — root and /bass move by the same interval.
  return table[mod12(rootChroma + semitones)] + parsed.quality + bass;
}

/**
 * Shift every valid chord in `content` by `semitones` (sign = direction) and
 * return the rewritten source. Non-chord text, annotations, escapes, titles, and
 * labels are preserved exactly. `semitones === 0` is a no-op (no re-spelling).
 */
export function transposeContent(
  content: string,
  semitones: number,
  theory: ChordTheory,
): string {
  if (semitones === 0) {
    return content;
  }
  const table = semitones > 0 ? UP : DOWN;

  let out = '';
  let i = 0;
  while (i < content.length) {
    const c = content[i];

    if (c === '\\') {
      // Preserve the escape pair verbatim so `\[` stays literal (not a chord).
      out += content[i];
      if (i + 1 < content.length) {
        out += content[i + 1];
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (c === '[') {
      const close = findClosingBracket(content, i);
      if (close === -1) {
        out += '[';
        i += 1;
        continue;
      }
      const inner = content.slice(i + 1, close);
      // Replace only chord tokens; whitespace/commas between them are preserved.
      const rewritten = inner.replace(/[^\s,]+/g, (token) =>
        transposeToken(token, table, semitones, theory),
      );
      out += '[' + rewritten + ']';
      i = close + 1;
      continue;
    }

    out += c;
    i += 1;
  }
  return out;
}

/**
 * Transpose only the chord bracket the caret sits in, by `semitones`.
 *
 * The sharp/flat buttons: they raise or lower **one** chord — the one under the
 * cursor — rather than the whole song, re-spelling it from the same direction
 * table as {@link transposeContent} (up → sharps, down → flats). A caret counts
 * as "in" a bracket when it is between its `[` and `]` (the same rule the editor's
 * insert guard uses). Returns the rewritten content and the new index of that
 * bracket's `]` (so the caret can stay inside it), or `null` when the caret is not
 * in a chord bracket — nothing to change.
 */
export function transposeChordAt(
  content: string,
  index: number,
  semitones: number,
  theory: ChordTheory,
): { content: string; bracketEnd: number } | null {
  if (semitones === 0) {
    return null;
  }
  const table = semitones > 0 ? UP : DOWN;

  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === '\\') {
      i += 2; // a `\[` is a literal bracket, not one the caret can be "in"
      continue;
    }
    if (c === '[') {
      const close = findClosingBracket(content, i);
      if (close === -1) {
        i += 1;
        continue;
      }
      if (i < index && index <= close) {
        const inner = content.slice(i + 1, close);
        const rewritten = inner.replace(/[^\s,]+/g, (token) =>
          transposeToken(token, table, semitones, theory),
        );
        return {
          content: content.slice(0, i + 1) + rewritten + content.slice(close),
          bracketEnd: i + 1 + rewritten.length,
        };
      }
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return null;
}
