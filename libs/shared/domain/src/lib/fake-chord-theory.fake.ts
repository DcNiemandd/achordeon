// Hand-rolled ChordTheory test double — Epic 2
// Spec: ADR-0008 (two-tier testing — pure core tested against a fake). Recognises
// a small, self-consistent chord grammar so the parser/transpose tests never
// depend on tonal. Excluded from the lib build (see tsconfig.lib.json exclude).

import { ChordTheory, type ParsedChord } from './theory';

const CHROMA: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const CHORD = /^([A-G](?:#|b)?)([^/\s]*)(?:\/([A-G](?:#|b)?))?$/;

export class FakeChordTheory extends ChordTheory {
  parseChord(text: string): ParsedChord | null {
    const m = CHORD.exec(text);
    if (!m) {
      return null;
    }
    const root = m[1];
    const bass = m[3] ?? null;
    if (!(root in CHROMA) || (bass !== null && !(bass in CHROMA))) {
      return null;
    }
    return { root, bass, quality: m[2] };
  }

  noteChroma(note: string): number | null {
    return note in CHROMA ? CHROMA[note] : null;
  }
}
