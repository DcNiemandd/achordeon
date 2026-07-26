import type { ChordAnchor, SongAst } from './ast';
import { FakeChordTheory } from './fake-chord-theory.fake';
import { respellChords, spellChord } from './notation';

const theory = new FakeChordTheory();
const german = (symbol: string) => spellChord(symbol, 'german', theory);
const english = (symbol: string) => spellChord(symbol, 'english', theory);

/** A one-line, one-block AST carrying exactly these anchors. */
function ast(...raws: string[]): SongAst {
  const chords: ChordAnchor[] = raws.map((raw, at) => ({
    raw,
    at,
    valid: theory.parseChord(raw) !== null,
  }));
  return { blocks: [{ lines: [{ text: 'la la', chords }] }], warnings: [] };
}

const spelt = (tree: SongAst) =>
  tree.blocks[0].lines[0].chords.map((c) => c.raw);

describe('spellChord', () => {
  it('leaves every symbol alone in English', () => {
    expect(english('B')).toBe('B');
    expect(english('Bb')).toBe('Bb');
    expect(english('H')).toBe('H'); // written German, printed as written
  });

  it('writes B natural as H and B flat as B', () => {
    expect(german('B')).toBe('H');
    expect(german('Bb')).toBe('B');
  });

  it('keeps the quality verbatim', () => {
    expect(german('Bm7')).toBe('Hm7');
    expect(german('Bbmaj7')).toBe('Bmaj7');
    expect(german('Bsus4')).toBe('Hsus4');
  });

  it('re-spells the bass note too', () => {
    expect(german('C/B')).toBe('C/H');
    expect(german('F/Bb')).toBe('F/B');
    expect(german('Bb/B')).toBe('B/H');
  });

  it('leaves a chord already written in German alone', () => {
    expect(german('H')).toBe('H');
    expect(german('Hm')).toBe('Hm');
    expect(german('E/H')).toBe('E/H');
  });

  it('touches nothing that is not a B', () => {
    expect(german('C#m7/G#')).toBe('C#m7/G#');
    expect(german('A#')).toBe('A#'); // Ais is a third notation, not this one
  });

  it('hands back an annotation verbatim', () => {
    expect(german('Solo')).toBe('Solo');
    expect(german('x2')).toBe('x2');
    expect(german('N.C.')).toBe('N.C.');
  });
});

describe('respellChords', () => {
  it('returns the very same tree in English', () => {
    const tree = ast('B', 'Bb');
    expect(respellChords(tree, 'english', theory)).toBe(tree);
  });

  it('returns the very same tree when German changes nothing', () => {
    const tree = ast('C', 'Am', 'G/D');
    expect(respellChords(tree, 'german', theory)).toBe(tree);
  });

  it('re-spells every anchor it can and leaves the rest', () => {
    const tree = ast('C', 'Bb', 'Solo', 'Bm');
    expect(spelt(respellChords(tree, 'german', theory))).toEqual([
      'C',
      'B',
      'Solo',
      'Hm',
    ]);
  });

  it('does not touch the source of the anchors it copies', () => {
    const tree = ast('B');
    respellChords(tree, 'german', theory);
    expect(spelt(tree)).toEqual(['B']);
  });

  it('keeps the anchor index and validity', () => {
    const [chord] = respellChords(ast('Bb'), 'german', theory).blocks[0]
      .lines[0].chords;
    expect(chord).toEqual({ raw: 'B', at: 0, valid: true });
  });
});
