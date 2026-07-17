import type { Block, GlobalSettings } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext } from './context';
import { assignColumns, layoutColumns } from './column-layout';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  chordColor: '#000000',
  chordSize: 1,
};
const ctx = () =>
  createContext(settings, createFakeMeasurer(), DEFAULT_TUNING, false);
const lyric = (text: string): Block => ({ lines: [{ text, chords: [] }] });

describe('assignColumns — balancing (§4.2)', () => {
  it('splits equal blocks evenly', () => {
    expect(assignColumns([10, 10, 10, 10], 2, 0)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('keeps a tall leading block alone to minimise the tallest column', () => {
    expect(assignColumns([30, 10, 10], 2, 0)).toEqual([[0], [1, 2]]);
  });

  it('preserves document order (contiguous segments only)', () => {
    const segs = assignColumns([5, 100, 5], 2, 0);
    expect(segs).toEqual([[0], [1, 2]]);
  });

  it('accounts for inter-block gaps in a column', () => {
    // gap 10: [0,1] costs 10+10+10=30 vs [0]/[1,2]=max(10, 10+10+10=30)=30; tie → earliest split
    expect(assignColumns([10, 10, 10], 2, 10)).toEqual([[0], [1, 2]]);
  });

  it('handles k = 1 and k ≥ n', () => {
    expect(assignColumns([1, 2, 3], 1, 0)).toEqual([[0, 1, 2]]);
    expect(assignColumns([5, 5], 5, 0)).toEqual([[0], [1]]);
    expect(assignColumns([], 3, 0)).toEqual([]);
  });
});

describe('layoutColumns — placement (§4.2)', () => {
  it('stacks blocks vertically in a single column', () => {
    const r = layoutColumns([lyric('aa'), lyric('bb')], 1, ctx());
    const ys = r.items.filter((i) => i.role === 'lyric').map((i) => i.y);
    expect(ys[0]).toBeCloseTo(12.8); // first block lyric baseline
    expect(ys[1]).toBeCloseTo(32 + 12.8); // 16 slot + 16 inter-block gap, then baseline
    expect(r.height).toBeCloseTo(48); // 16 + 16 gap + 16
  });

  it('places columns left to right with the column gap', () => {
    const r = layoutColumns([lyric('aa'), lyric('bb')], 2, ctx());
    const xs = r.items.filter((i) => i.role === 'lyric').map((i) => i.x);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeCloseTo(19.2 + 32); // col width 19.2 + column gap (2em = 32)
    expect(r.height).toBeCloseTo(16); // one block per column
    expect(r.width).toBeCloseTo(19.2 + 32 + 19.2);
  });

  it('ignores empty blocks', () => {
    const r = layoutColumns([lyric('aa'), { lines: [] }], 1, ctx());
    expect(r.items.filter((i) => i.role === 'lyric')).toHaveLength(1);
    expect(r.height).toBeCloseTo(16);
  });
});

describe('layoutColumns — the inline-label gutter (§4.8)', () => {
  const labelled = (label: string, text: string): Block => ({
    label,
    labelInline: true,
    lines: [{ text, chords: [] }],
  });

  it('sizes the gutter to the widest inline label PLUS a gap', () => {
    // Without the gap the label ends exactly where its lyric starts, and the two
    // touch on screen — which is what shipped.
    const r = layoutColumns([labelled('Chorus', 'sing')], 1, ctx());
    const labelWidth = 6 * 16 * 0.6; // "Chorus" at the fake measurer's advance
    const gap = DEFAULT_TUNING.spacing.gutterGapEm * DEFAULT_TUNING.baseSizePx;

    const lyricX = r.items.find((i) => i.role === 'lyric')?.x;
    expect(lyricX).toBeCloseTo(labelWidth + gap);
    expect(lyricX).toBeGreaterThan(labelWidth);
  });

  it('gives every block in the column the same gutter — the widest label wins', () => {
    const r = layoutColumns(
      [labelled('1.', 'aa'), labelled('Chorus', 'bb')],
      1,
      ctx(),
    );
    const xs = r.items.filter((i) => i.role === 'lyric').map((i) => i.x);
    expect(xs[0]).toBeCloseTo(xs[1]!);
  });

  it('charges no gap to a column with no inline label', () => {
    const r = layoutColumns([lyric('aa')], 1, ctx());
    expect(r.items.find((i) => i.role === 'lyric')?.x).toBe(0);
  });

  it('gives a two-line label no gutter — it sits on its own row (§4.8)', () => {
    const twoLine: Block = {
      label: 'Chorus',
      labelInline: false,
      lines: [{ text: 'sing', chords: [] }],
    };
    const r = layoutColumns([twoLine], 1, ctx());
    expect(r.items.find((i) => i.role === 'lyric')?.x).toBe(0);
  });
});
