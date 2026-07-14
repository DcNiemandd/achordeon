import { chordTheoryContract } from './chord-theory.contract';
import { TonalChordTheory } from './tonal-chord-theory';

// The tonal adapter must satisfy the shared ChordTheory contract.
chordTheoryContract(() => new TonalChordTheory());
