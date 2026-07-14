// Tonal adapter for the ChordTheory port — Epic 2 ▸ subtask 2
// Spec: ADR-0008, PRD-DOMAIN-MODEL.md §Music-theory seam

import { Injectable } from '@angular/core';
import { ChordTheory, type ParsedChord } from '@achordeon/shared/domain';
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
    const chord = getChord(text);
    if (chord.empty || !chord.tonic) {
      return null;
    }
    const root = chord.tonic;
    const bass = chord.bass ? chord.bass : null;

    // Quality = the suffix as the user wrote it (verbatim, so transpose preserves
    // it). Strip the recognised root off the front and the /bass off the back;
    // tonal's own normalisation is deliberately ignored here.
    let quality = text.startsWith(root) ? text.slice(root.length) : text;
    if (bass) {
      const slash = quality.lastIndexOf('/');
      if (slash !== -1) {
        quality = quality.slice(0, slash);
      }
    }
    return { root, bass, quality };
  }

  noteChroma(note: string): number | null {
    const c = chroma(note);
    return Number.isFinite(c) ? c : null;
  }
}
