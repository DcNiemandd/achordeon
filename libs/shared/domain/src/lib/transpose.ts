// Transpose — pure domain policy — Epic 2 ▸ subtask 6
// Spec: ADR-0008, PRD-DOMAIN-MODEL.md §Transpose, docs/PARSER-GRAMMAR.md.
// A destructive SOURCE rewrite (not an AST transform): shifts every valid chord
// by ±N semitones and re-spells from a fixed direction table. Everything outside
// a chord token is preserved byte-for-byte. Reuses the parser's chord sub-grammar
// (one bracket recogniser) via the injected ChordTheory port — kept pure by
// taking the port as a parameter.
//
// **Notation is an argument, not an ambient setting.** A rewrite has to choose a
// spelling, and which alphabet the author reads is a preference the domain cannot
// guess — so it arrives per call, defaulting to `english` so a caller that has no
// opinion gets exactly the behaviour this file has always had. The German half of
// the choice is `spellNoteInSource` (notation.ts), shared with the render's
// speller so the two cannot drift on what `H` means.

import {
  findClosingBracket,
  findClosingDoubleBracket,
  type ChordNotation,
} from './chords';
import { spellNoteInSource } from './notation';
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
  notation: ChordNotation,
): string {
  const parsed = theory.parseChord(token);
  if (!parsed) {
    return token; // invalid-as-annotation ([Solo], [x2], [N.C.]) — never transposed
  }
  // The direction table picks the accidental; the notation picks the alphabet.
  // Two independent questions about one note, answered in that order.
  const spell = (chroma: number) =>
    spellNoteInSource(table[mod12(chroma + semitones)], notation);

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
    bass = '/' + spell(bassChroma);
  }
  // root + verbatim quality + /bass — root and /bass move by the same interval.
  return spell(rootChroma) + parsed.quality + bass;
}

/**
 * Shift every valid chord in `content` by `semitones` (sign = direction) and
 * return the rewritten source. Non-chord text, annotations, escapes, titles, and
 * labels are preserved exactly. `semitones === 0` is a no-op (no re-spelling).
 *
 * `notation` is the alphabet the rewrite is written in — the caller's resolved
 * `notation` setting, or `english` for a caller that has none. Under `german` a
 * transposed B natural comes back as `H` instead of `B`, which is what stops a
 * German author's own text turning English the first time they transpose it: they
 * typed `[H]`, the page has been printing `H` all along, and now the editor agrees
 * with the page again. It is a spelling and nothing more — `H` is B natural under
 * either setting, so the file still means the same thing everywhere, and the
 * printed page does not move by a pixel.
 */
export function transposeContent(
  content: string,
  semitones: number,
  theory: ChordTheory,
  notation: ChordNotation = 'english',
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

    // An inline group holds the same tokens as any bracket, so it transposes the
    // same way — tested first, because its `[[` also matches the single-bracket
    // branch and would leave `[C` as a non-chord token, silently untransposed.
    if (c === '[' && content[i + 1] === '[') {
      const close = findClosingDoubleBracket(content, i);
      if (close !== -1) {
        const inner = content.slice(i + 2, close);
        const rewritten = inner.replace(/[^\s,]+/g, (token) =>
          transposeToken(token, table, semitones, theory, notation),
        );
        out += '[[' + rewritten + ']]';
        i = close + 2;
        continue;
      }
      out += '[';
      i += 1;
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
        transposeToken(token, table, semitones, theory, notation),
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
 *
 * `notation` means what it means in {@link transposeContent}, and has to be passed
 * for the same reason: these buttons and the whole-song ones write into the same
 * text, so a `♭` that spelled a chord one way and a transpose that spelled it
 * another would leave two alphabets in one song.
 */
export function transposeChordAt(
  content: string,
  index: number,
  semitones: number,
  theory: ChordTheory,
  notation: ChordNotation = 'english',
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
    if (c === '[' && content[i + 1] === '[') {
      const close = findClosingDoubleBracket(content, i);
      if (close === -1) {
        i += 1;
        continue;
      }
      // "In" an inline group means past its second `[` and no further than its
      // first `]` — the single-bracket rule, shifted by the doubled markers.
      if (i + 1 < index && index <= close) {
        const inner = content.slice(i + 2, close);
        const rewritten = inner.replace(/[^\s,]+/g, (token) =>
          transposeToken(token, table, semitones, theory, notation),
        );
        return {
          content: content.slice(0, i + 2) + rewritten + content.slice(close),
          bracketEnd: i + 2 + rewritten.length,
        };
      }
      i = close + 2;
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
          transposeToken(token, table, semitones, theory, notation),
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
