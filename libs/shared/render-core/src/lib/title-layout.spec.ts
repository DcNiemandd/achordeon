import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext } from './context';
import { layoutTitle } from './title-layout';

// title size 28 (adv 16.8, ascent 22.4, h 28); subtitle 18.4 (adv 11.04, ascent 14.72, h 18.4)
const base: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  chordColor: '#000000',
  chordSize: 1,
};
const ctx = () =>
  createContext(base, createFakeMeasurer(), DEFAULT_TUNING, false);
const ast = (title?: string, subtitle?: string): SongAst => ({
  title,
  subtitle,
  blocks: [],
  warnings: [],
});
const settings = (over: Partial<GlobalSettings>): GlobalSettings => ({
  ...base,
  ...over,
});

describe('layoutTitle — empty', () => {
  it('reserves nothing when there is no title or subtitle', () => {
    const r = layoutTitle(ast(), ctx(), base);
    expect(r.items).toEqual([]);
    expect(r).toMatchObject({ width: 0, height: 0, offset: { x: 0, y: 0 } });
  });
});

describe('layoutTitle — top (§4.5)', () => {
  it('stacks title over subtitle, hugging the top-left, offsetting content down', () => {
    const r = layoutTitle(
      ast('Song', 'Sub'),
      ctx(),
      settings({ titlePosition: 'top', titleLayout: 'stacked' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.x).toBe(0);
    expect(title?.y).toBeCloseTo(22.4);
    expect(title?.rotate).toBeUndefined();
    expect(subtitle?.x).toBe(0);
    expect(subtitle?.y).toBeGreaterThan(28); // below the title row
    expect(r.offset.x).toBe(0);
    expect(r.offset.y).toBeCloseTo(r.height + 16); // region height + title gap
  });

  it('puts title and subtitle on one row side by side when inline', () => {
    const r = layoutTitle(
      ast('Song', 'Sub'),
      ctx(),
      settings({ titlePosition: 'top', titleLayout: 'inline' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.y).toBeCloseTo(subtitle?.y as number); // same row
    expect(subtitle?.x).toBeCloseTo(4 * 16.8 + 0.75 * 16); // titleW + inline gap
  });
});

describe('layoutTitle — left spine (§4.5)', () => {
  it('rotates two parallel spines CCW, offsetting content to the right', () => {
    const r = layoutTitle(
      ast('Song', 'Sub'),
      ctx(),
      settings({ titlePosition: 'left', titleLayout: 'stacked' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.rotate).toBe(-90);
    expect(subtitle?.rotate).toBe(-90);
    expect(subtitle?.x).toBeGreaterThan(title?.x as number); // subtitle spine is inner
    expect(r.offset.y).toBe(0);
    expect(r.offset.x).toBeCloseTo(28 + 18.4 + 16); // both bands + gap
  });

  it('reads title then subtitle up one spine when inline', () => {
    const r = layoutTitle(
      ast('Song', 'Sub'),
      ctx(),
      settings({ titlePosition: 'left', titleLayout: 'inline' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.x).toBeCloseTo(subtitle?.x as number); // one band
    expect(title?.y).toBeGreaterThan(subtitle?.y as number); // title sits below (read first)
    expect(r.offset.x).toBeCloseTo(28 + 16); // one band width + gap
  });
});

describe('layoutTitle — title only', () => {
  it('lays out a lone title with no subtitle item', () => {
    const r = layoutTitle(ast('Song'), ctx(), base);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ role: 'title', x: 0 });
  });
});
