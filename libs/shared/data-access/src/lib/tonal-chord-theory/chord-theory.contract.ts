// Contract every ChordTheory implementation must satisfy — Epic 2 ▸ subtask 2
// Spec: ADR-0008 (two-tier testing). Runs against the tonal adapter today and any
// future engine unchanged, so a swap is provably behaviour-preserving. Excluded
// from the lib build (see tsconfig.lib.json exclude); imported only by *.spec.ts.

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ChordTheory } from '@achordeon/shared/domain';

/**
 * Register the shared behavioural contract against a fresh implementation from
 * `make`. These are implementation-agnostic music-theory truths — not tonal
 * quirks — so the future custom engine must pass them too.
 */
export function chordTheoryContract(make: () => ChordTheory): void {
  describe('ChordTheory contract', () => {
    let theory: ChordTheory;
    beforeEach(() => {
      theory = make();
    });

    describe('parseChord', () => {
      it('parses a bare major triad (empty quality, no bass)', () => {
        expect(theory.parseChord('C')).toEqual({
          root: 'C',
          bass: null,
          quality: '',
        });
      });

      it('keeps the quality suffix verbatim', () => {
        expect(theory.parseChord('Cmaj7')).toEqual({
          root: 'C',
          bass: null,
          quality: 'maj7',
        });
        expect(theory.parseChord('Am')).toEqual({
          root: 'A',
          bass: null,
          quality: 'm',
        });
      });

      it('splits an accidental root, quality, and /bass', () => {
        expect(theory.parseChord('C#m7/G')).toEqual({
          root: 'C#',
          bass: 'G',
          quality: 'm7',
        });
      });

      it('returns null for annotations that are not chords', () => {
        for (const text of ['Solo', 'x2', 'N.C.', 'Intro', '', '   ']) {
          expect(theory.parseChord(text)).toBeNull();
        }
      });
    });

    describe('noteChroma', () => {
      it('maps notes to pitch-class 0..11', () => {
        expect(theory.noteChroma('C')).toBe(0);
        expect(theory.noteChroma('C#')).toBe(1);
        expect(theory.noteChroma('B')).toBe(11);
      });

      it('treats enharmonic spellings as the same chroma', () => {
        expect(theory.noteChroma('C#')).toBe(theory.noteChroma('Db'));
        expect(theory.noteChroma('Gb')).toBe(theory.noteChroma('F#'));
      });

      it('returns null for things that are not notes', () => {
        expect(theory.noteChroma('Solo')).toBeNull();
        expect(theory.noteChroma('')).toBeNull();
      });
    });
  });
}
