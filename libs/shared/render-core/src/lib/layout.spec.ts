import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { createFontBook } from './fonts';
import { createLayout, layoutCore } from './layout';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  chordColor: '#000000',
  chordSize: 1,
};
const measure = createFakeMeasurer();
const ast = (over: Partial<SongAst> = {}): SongAst => ({
  blocks: [],
  warnings: [],
  ...over,
});

describe('layoutCore — assembly (§1, §5)', () => {
  it('produces an empty plan for an empty song', () => {
    const plan = layoutCore(ast(), settings, measure);
    expect(plan.items).toEqual([]);
    expect(plan.box).toEqual({ width: 0, height: 0 });
    expect(plan.fit).toBe(1);
  });

  it('places the title region and offsets content below it (top)', () => {
    const plan = layoutCore(
      ast({ title: 'T', blocks: [{ lines: [{ text: 'aa', chords: [] }] }] }),
      settings,
      measure,
    );
    const title = plan.items.find((i) => i.role === 'title');
    const lyric = plan.items.find((i) => i.role === 'lyric');
    expect(title?.y).toBeCloseTo(22.4);
    // title region height (28) + gap (16) = 44, then lyric baseline 12.8
    expect(lyric?.y).toBeCloseTo(44 + 12.8);
    expect(plan.box.height).toBeCloseTo(60);
  });

  it('carries the resolved per-role styles', () => {
    const plan = layoutCore(ast({ title: 'T' }), settings, measure);
    expect(plan.styles.chord.fill).toBe('#000000');
    expect(plan.styles.title.weight).toBe('bold');
  });

  it('omits chord glyphs under hideChords but keeps the reserved rows', () => {
    const chorded = ast({
      blocks: [
        { lines: [{ text: 'a', chords: [{ raw: 'C', at: 0, valid: true }] }] },
      ],
    });
    const shown = layoutCore(chorded, settings, measure);
    const hidden = layoutCore(chorded, settings, measure, { hideChords: true });
    expect(shown.items.some((i) => i.role === 'chord')).toBe(true);
    expect(hidden.items.some((i) => i.role === 'chord')).toBe(false);
    // lyric baseline identical ⇒ reflow-safe
    expect(hidden.items.find((i) => i.role === 'lyric')?.y).toBeCloseTo(
      shown.items.find((i) => i.role === 'lyric')?.y as number,
    );
  });

  it('threads the injected font book into the plan', () => {
    const fonts = createFontBook('Achordeon', { regular: 'QUJD' });
    const plan = layoutCore(
      ast({ title: 'T' }),
      settings,
      measure,
      {},
      { fonts },
    );
    expect(plan.fonts).toEqual(fonts);
  });

  it('honours a tuning override', () => {
    const plan = layoutCore(
      ast({ title: 'T' }),
      settings,
      measure,
      {},
      { tuning: { baseSizePx: 32 } },
    );
    expect(plan.styles.lyric.sizePx).toBe(32);
  });

  it('breaks content into the requested number of columns', () => {
    const blocks = [
      { lines: [{ text: 'aa', chords: [] }] },
      { lines: [{ text: 'bb', chords: [] }] },
    ];
    const one = layoutCore(
      ast({ blocks }),
      { ...settings, columns: 1 },
      measure,
    );
    const two = layoutCore(
      ast({ blocks }),
      { ...settings, columns: 2 },
      measure,
    );
    const oneXs = new Set(one.items.map((i) => i.x));
    const twoXs = new Set(two.items.map((i) => i.x));
    expect(oneXs.size).toBeLessThan(twoXs.size); // second column introduces a new x
  });
});

describe('createLayout — bound surface (§5)', () => {
  it('binds the measurer and config once', () => {
    const layout = createLayout(measure, { tuning: { baseSizePx: 20 } });
    const plan = layout(ast({ title: 'T' }), settings);
    expect(plan.styles.lyric.sizePx).toBe(20);
  });
});
