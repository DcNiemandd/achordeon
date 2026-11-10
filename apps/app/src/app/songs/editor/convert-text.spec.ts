// What the Convert bar and the Convert button put in place of the text — plan
// phase 2/2b. Content is always English; the song's notation only spells the page.

import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { convertText } from './convert-text';

const theory = new TonalChordTheory();

describe('convertText', () => {
  it('writes a German sheet in English chords', () => {
    expect(convertText('Ami   H7\nSome words', theory)).toBe(
      '[Am]Some w[B7]ords',
    );
  });

  it('leaves an English sheet spelled as it is', () => {
    expect(convertText('Am    Bb\nSome words', theory)).toBe(
      '[Am]Some w[Bb]ords',
    );
  });

  it('converts a single chord row the detector would not call a sheet', () => {
    expect(convertText('Am    F\nSome words', theory)).toBe(
      '[Am]Some w[F]ords',
    );
  });

  it('still reads ChordPro as ChordPro', () => {
    expect(convertText('{t: A}\n[Ami]Words', theory)).toBe('* A\n[Am]Words');
  });

  it('ends the way the text ended', () => {
    expect(convertText('Am    F\nSome words\n', theory)).toBe(
      '[Am]Some w[F]ords\n',
    );
  });
});
