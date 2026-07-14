import type { SongAst } from './ast';
import { FakeChordTheory } from './fake-chord-theory.fake';
import { parse } from './parser';

const theory = new FakeChordTheory();
const run = (content: string): SongAst => parse(content, theory);

describe('parse', () => {
  it('assembles a whole song: title, subtitle, labelled block, anchored chords', () => {
    const ast = run(
      ['* My Song', '** The Author', '', 'Verse: tr[C]ade', 'and [G]go'].join(
        '\n',
      ),
    );
    expect(ast.title).toBe('My Song');
    expect(ast.subtitle).toBe('The Author');
    expect(ast.warnings).toEqual([]);
    expect(ast.blocks).toEqual([
      {
        label: 'Verse',
        labelInline: true,
        lines: [
          { text: 'trade', chords: [{ raw: 'C', at: 2, valid: true }] },
          { text: 'and go', chords: [{ raw: 'G', at: 4, valid: true }] },
        ],
      },
    ]);
  });

  it('is total for empty input (no title/subtitle keys, no throw)', () => {
    const ast = run('');
    expect(ast).toEqual({ blocks: [], warnings: [] });
    expect('title' in ast).toBe(false);
    expect('subtitle' in ast).toBe(false);
  });

  describe('effective title / subtitle ("last wins")', () => {
    it('keeps the last title and shadows the earlier ones', () => {
      const ast = run('* First\n* Second\n* Third');
      expect(ast.title).toBe('Third');
      expect(ast.warnings).toEqual([
        { code: 'SHADOWED_TITLE', line: 0, range: [0, 7] },
        { code: 'SHADOWED_TITLE', line: 1, range: [0, 8] },
      ]);
    });

    it('shadows earlier subtitles with SHADOWED_SUBTITLE', () => {
      const ast = run('** A\n** B');
      expect(ast.subtitle).toBe('B');
      expect(ast.warnings).toEqual([
        { code: 'SHADOWED_SUBTITLE', line: 0, range: [0, 4] },
      ]);
    });

    it('emits no warning for a single title/subtitle', () => {
      expect(run('* Only\n** Solo author').warnings).toEqual([]);
    });

    it('sorts warnings by source line', () => {
      const ast = run('* T1\n** S1\n* T2\n** S2');
      expect(ast.warnings).toEqual([
        { code: 'SHADOWED_TITLE', line: 0, range: [0, 4] },
        { code: 'SHADOWED_SUBTITLE', line: 1, range: [0, 5] },
      ]);
    });
  });
});
