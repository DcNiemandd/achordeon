import { FakeChordTheory } from './fake-chord-theory.fake';
import { spellChord } from './notation';
import { transposeChordAt, transposeContent } from './transpose';

const theory = new FakeChordTheory();
const shift = (content: string, semitones: number) =>
  transposeContent(content, semitones, theory);
/** The same call with the German alphabet asked for. */
const shiftDe = (content: string, semitones: number) =>
  transposeContent(content, semitones, theory, 'german');

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

  it('transposes a German H (= B natural), re-spelling into English', () => {
    // H is valid input and moves like the B it names. With no notation asked for,
    // the output uses the English spelling table — the default is unchanged.
    expect(shift('[H]', 1)).toBe('[C]');
    expect(shift('[Hm7]', 2)).toBe('[C#m7]');
    expect(shift('[C/H]', 2)).toBe('[D/C#]');
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

describe('transposeContent — the notation option', () => {
  it('defaults to English, so an unasked caller sees no change', () => {
    expect(transposeContent('[C]', -1, theory)).toBe('[B]');
    expect(transposeContent('[C]', -1, theory, 'english')).toBe('[B]');
  });

  it('gives a German author back the H they typed', () => {
    // The reported break: `[H]` up and down again came back `[B]`, so the editor
    // said B (which German reads as B♭) while the page went on printing H.
    expect(shiftDe(shiftDe('[H]', 1), -1)).toBe('[H]');
    expect(shift(shift('[H]', 1), -1)).toBe('[B]'); // …as it did before
  });

  it('spells a transposed B natural as H, root and /bass alike', () => {
    expect(shiftDe('[C]', -1)).toBe('[H]');
    expect(shiftDe('[Cm7]', -1)).toBe('[Hm7]');
    expect(shiftDe('[C/E]', -1)).toBe('[H/Eb]'); // down still prefers flats
    expect(shiftDe('[F/C]', -1)).toBe('[E/H]');
    expect(shiftDe('[A#]', 1)).toBe('[H]'); // up too, once it lands on B
  });

  it('leaves B flat spelled Bb — the one German spelling the source cannot hold', () => {
    // On the page B♭ prints as a bare `B`; in the SOURCE a bare `B` is B natural
    // for every reader, so writing it there would move the chord up a semitone.
    expect(shiftDe('[C]', -2)).toBe('[Bb]');
    expect(spellChord('Bb', 'german', theory)).toBe('B'); // …printed, though
  });

  it('touches nothing that is not a B, and reformats nothing at all', () => {
    expect(shiftDe('tr[C]ade and [Am]go', 3)).toBe('tr[D#]ade and [Cm]go');
    expect(shiftDe('[Solo] [x2]', 5)).toBe('[Solo] [x2]');
    expect(shiftDe('[F#m7/C#]', 1)).toBe('[Gm7/D]');
    expect(shiftDe('a\\[C]b', 2)).toBe('a\\[C]b');
  });

  it('writes only symbols that read back as the same note', () => {
    // The property that makes a German rewrite safe: whatever it puts in the
    // source parses to the chroma it was spelled from, so a round trip through
    // the parser is lossless and a file still means one thing on every device.
    for (let semitones = -12; semitones <= 12; semitones++) {
      for (const start of ['C', 'H', 'Bb', 'E', 'F#', 'Ab']) {
        const [, written] = /\[(.+)]/.exec(
          shiftDe(`[${start}]`, semitones),
        ) ?? ['', start];
        const plain = transposeContent(`[${start}]`, semitones, theory);
        const [, english] = /\[(.+)]/.exec(plain) ?? ['', start];
        expect(theory.noteChroma(written)).toBe(theory.noteChroma(english));
      }
    }
  });
});

describe('transposeChordAt — one chord under the caret (sharp/flat)', () => {
  const at = (content: string, index: number, semitones: number) =>
    transposeChordAt(content, index, semitones, theory);

  it('sharps only the chord the caret is inside, leaving the rest', () => {
    // Caret inside the second bracket ("[G]"): only it moves up a semitone.
    const r = at('la [C]la [G]lo', 10, 1);
    expect(r?.content).toBe('la [C]la [G#]lo');
    // The new `]` index, so the caret can stay inside the (now longer) bracket.
    expect(r?.bracketEnd).toBe(12);
  });

  it('flats the chord the caret is inside', () => {
    expect(at('[C]', 1, -1)?.content).toBe('[B]');
    expect(at('[E]', 2, -1)?.content).toBe('[Eb]');
  });

  it('counts the caret as inside from just after [ up to and including on ]', () => {
    expect(at('[C]', 1, 1)?.content).toBe('[C#]'); // just after [
    expect(at('[C]', 2, 1)?.content).toBe('[C#]'); // on the ]
    expect(at('[C]', 0, 1)).toBeNull(); // on the [ — not yet inside
    expect(at('[C]', 3, 1)).toBeNull(); // past the ] — no longer inside
  });

  it('moves every chord in a shared bracket together', () => {
    expect(at('[C G]', 2, 1)?.content).toBe('[C# G#]');
  });

  it('returns null off any chord, and for a zero shift', () => {
    expect(at('lala', 2, 1)).toBeNull();
    expect(at('[C]', 1, 0)).toBeNull();
  });

  it('takes the same notation option, and defaults to English', () => {
    // The ♭ button on a German author's [C]: `[H]`, not `[B]` — and the returned
    // bracketEnd still points at the `]` of what was actually written.
    expect(at('[C]', 1, -1)?.content).toBe('[B]');
    const de = transposeChordAt('[C]', 1, -1, theory, 'german');
    expect(de?.content).toBe('[H]');
    expect(de?.bracketEnd).toBe(2);
    expect(transposeChordAt('[C G]', 2, -1, theory, 'german')?.content).toBe(
      '[H Gb]',
    );
  });
});
