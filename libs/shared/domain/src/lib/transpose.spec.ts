import { FakeChordTheory } from './fake-chord-theory.fake';
import { transposeContent } from './transpose';

const theory = new FakeChordTheory();
const shift = (content: string, semitones: number) =>
  transposeContent(content, semitones, theory);

describe('transposeContent', () => {
  it('is a no-op for 0 semitones (no re-spelling)', () => {
    expect(shift('[Db] and [C#]', 0)).toBe('[Db] and [C#]');
  });

  it('shifts a root up and preserves the surrounding source exactly', () => {
    expect(shift('tr[C]ade and [Am]go', 2)).toBe('tr[D]ade and [Bm]go');
  });

  it('spells sharps going up and flats going down (direction policy)', () => {
    expect(shift('[C]', 1)).toBe('[C#]');
    expect(shift('[C]', -1)).toBe('[B]');
    expect(shift('[C]', -2)).toBe('[Bb]');
    expect(shift('[E]', -1)).toBe('[Eb]');
  });

  it('normalises accidental input to the direction table', () => {
    expect(shift('[Db]', 2)).toBe('[D#]'); // up → sharp spelling of chroma 3
    expect(shift('[C#]', -2)).toBe('[B]');
  });

  it('preserves the quality suffix verbatim', () => {
    expect(shift('[Cmaj7]', 1)).toBe('[C#maj7]');
    expect(shift('[Am7]', 2)).toBe('[Bm7]');
  });

  it('moves root and /bass by the same interval', () => {
    expect(shift('[C/G]', 2)).toBe('[D/A]');
    expect(shift('[F#m7/C#]', 1)).toBe('[Gm7/D]');
  });

  it('skips invalid-as-annotation brackets', () => {
    expect(shift('[Solo] [x2] [N.C.]', 5)).toBe('[Solo] [x2] [N.C.]');
  });

  it('preserves separators between multiple chords in one bracket', () => {
    expect(shift('[C, G]', 2)).toBe('[D, A]');
    expect(shift('[C G]', 2)).toBe('[D A]');
  });

  it('does not touch an escaped bracket', () => {
    expect(shift('a\\[C]b', 2)).toBe('a\\[C]b');
  });

  it('leaves every non-chord character byte-identical across lines', () => {
    const content = ['* My Song', 'Verse: la [C]la', 'la [G7]la'].join('\n');
    expect(shift(content, 2)).toBe(
      ['* My Song', 'Verse: la [D]la', 'la [A7]la'].join('\n'),
    );
  });
});
