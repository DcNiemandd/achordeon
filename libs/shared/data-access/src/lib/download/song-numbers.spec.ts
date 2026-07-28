import type { SongAst } from '@achordeon/shared/domain';
import { numberedAst } from './download-service';

const ast = (over: Partial<SongAst> = {}): SongAst => ({
  blocks: [],
  warnings: [],
  ...over,
});

describe('numberedAst (song numbers on the page)', () => {
  it('puts the number in front of the title', () => {
    expect(numberedAst(ast({ title: 'Wonderwall' }), 7).title).toBe(
      '7. Wonderwall',
    );
  });

  it('never pads the number', () => {
    // The whole ask: a reader turns to song 7, not to song 07. Padding exists in
    // the image ZIP's file names so a lexical sort holds, and a reader sorts
    // nothing.
    const titles = [1, 2, 10, 11, 100].map(
      (n) => numberedAst(ast({ title: 'Song' }), n).title,
    );
    expect(titles).toEqual([
      '1. Song',
      '2. Song',
      '10. Song',
      '11. Song',
      '100. Song',
    ]);
  });

  it('gives an untitled song the bare number, not a dangling dot', () => {
    expect(numberedAst(ast(), 3).title).toBe('3');
    expect(numberedAst(ast({ title: '   ' }), 3).title).toBe('3');
  });

  it('numbers a song that has only a subtitle, so the page can be found', () => {
    // The subtitle already renders; without this the summary would point at a
    // sheet carrying nothing that confirms the reader arrived.
    const numbered = numberedAst(ast({ subtitle: 'Oasis' }), 4);
    expect(numbered.title).toBe('4');
    expect(numbered.subtitle).toBe('Oasis');
  });

  it('leaves the rest of the song alone', () => {
    const original = ast({
      title: 'Wonderwall',
      subtitle: 'Oasis',
      blocks: [{ lines: [{ text: 'Today is gonna be', chords: [] }] }],
      warnings: [],
    });
    const numbered = numberedAst(original, 1);
    expect(numbered.blocks).toBe(original.blocks);
    expect(numbered.subtitle).toBe('Oasis');
    // Pure: the input is not touched, so a re-render without numbers is still
    // the song the user wrote.
    expect(original.title).toBe('Wonderwall');
  });
});
