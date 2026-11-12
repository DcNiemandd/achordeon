import {
  convertChordSheet,
  type ChordSheetChoices,
} from '@achordeon/shared/domain';
import { TonalChordTheory } from './tonal-chord-theory';

// The cases where converting a Chord sheet depends on what the REAL recogniser
// accepts (ADR-0008's second tier). The behaviour itself is pinned in the
// domain against the fake; these hold it to tonal.

const theory = new TonalChordTheory();

function content(text: string, choices: ChordSheetChoices = {}): string {
  const result = convertChordSheet(text, theory, {
    format: 'chordpro',
    ...choices,
  });
  if (result.kind !== 'converted') {
    throw new Error('expected a chord sheet');
  }
  return result.content;
}

describe('a Chord sheet against tonal', () => {
  it('turns a Czech mi minor, which tonal does not read, into one it does', () => {
    expect(theory.parseChord('Ami')).toBeNull();
    expect(content('[Ami]Words\n', { dialect: 'german' })).toBe('[Am]Words\n');
  });

  it('respells a mi that tonal happens to accept', () => {
    expect(theory.parseChord('Emi7')).not.toBeNull();
    expect(content('[Emi7]Words\n', { dialect: 'german' })).toBe(
      '[Em7]Words\n',
    );
  });

  it('leaves an annotation alone when respelling would make no chord', () => {
    expect(content('[Bass]Words\n', { dialect: 'german' })).toBe(
      '[Bass]Words\n',
    );
  });

  it('reads a row of German chords as a row of chords', () => {
    expect(
      content(['Hmi       Fis', 'Some words of a song'].join('\n'), {
        format: 'chord-rows',
        dialect: 'german',
      }),
    ).toBe('[Bm]Some words[F#] of a song\n');
  });

  it('leaves a lowercase one-letter row for a human where nothing settles it', () => {
    const result = convertChordSheet(['a', 'nějaká slova'].join('\n'), theory, {
      format: 'chord-rows',
    });
    if (result.kind !== 'converted') {
      throw new Error('expected a chord sheet');
    }
    expect(result.content).toBe('a\nnějaká slova\n');
    expect(result.songs[0].report.ambiguous).toEqual([1]);
  });
});
