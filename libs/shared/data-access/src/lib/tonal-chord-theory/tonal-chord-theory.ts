// Tonal adapter for the ChordTheory port — Epic 2 ▸ subtask 2
// Spec: ADR-0008, PRD-DOMAIN-MODEL.md §Music-theory seam

import { Injectable } from '@angular/core';
import {
  ChordTheory,
  toEnglishNotation,
  type ParsedChord,
} from '@achordeon/shared/domain';
import { get as getChord } from '@tonaljs/chord';
import { chroma } from '@tonaljs/note';

/**
 * The one and only `@tonaljs/*` importer (ADR-0008). Backs the `ChordTheory`
 * port with tonal's chord recogniser and pitch-class arithmetic. Carries no
 * policy — spelling and transpose stay in `shared/domain`; this only reports
 * facts. Swapping tonal for a hand-rolled engine is a new adapter here plus one
 * provider change, proven equivalent by the shared contract suite.
 */
@Injectable()
export class TonalChordTheory extends ChordTheory {
  parseChord(text: string): ParsedChord | null {
    // German → English first, so `[H]` reaches tonal as `B` (§notation).
    const symbol = toEnglishNotation(text);
    const chord = getChord(symbol);
    if (chord.empty || !chord.tonic) {
      return null;
    }
    const root = chord.tonic;
    const bass = chord.bass ? chord.bass : null;

    // Quality = the suffix as written (verbatim, so transpose preserves it),
    // measured against the NORMALISED symbol so the root length lines up — the
    // original `H` is preserved for display in the anchor's `raw`, not here.
    // tonal's own normalisation is deliberately ignored.
    let quality = symbol.startsWith(root) ? symbol.slice(root.length) : symbol;
    if (bass) {
      const slash = quality.lastIndexOf('/');
      if (slash !== -1) {
        quality = quality.slice(0, slash);
      }
    }
    return { root, bass, quality };
  }

  noteChroma(note: string): number | null {
    const c = chroma(toEnglishNotation(note));
    return Number.isFinite(c) ? c : null;
  }
}
