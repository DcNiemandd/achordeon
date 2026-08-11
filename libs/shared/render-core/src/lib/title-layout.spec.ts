import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext, type LayoutContext } from './context';
import { layoutTitle } from './title-layout';

// title size 24 (adv 14.4, ascent 19.2, h 24); subtitle 19.2 (adv 11.52, ascent 15.36, h 19.2)
const base: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  bodyFont: 'roboto-mono',
  titleFont: 'body',
  padding: 0,
  blockGap: DEFAULT_TUNING.spacing.interBlockGapFactor,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#000000',
  chordSize: 1,
  notation: 'english',
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

/**
 * The two gaps below the titles, derived rather than spelled out.
 *
 * Both are magnitudes the renderer's author tunes (§4.7 "spacing magnitudes are
 * tunable internal constants"), so a baked number makes these tests fail on a
 * change of taste rather than on a defect — `column-layout.spec.ts` has the same
 * note. What they actually assert is the arithmetic around the gap: band, gap,
 * content.
 */
const titleGap = (c: LayoutContext) =>
  DEFAULT_TUNING.spacing.titleGapFactor * c.metrics.lyric.height;
const inlineGap = () =>
  DEFAULT_TUNING.spacing.titleInlineGapEm * DEFAULT_TUNING.baseSizePx;

describe('layoutTitle — empty', () => {
  it('reserves nothing when there is no title or subtitle', () => {
    const r = layoutTitle(ast(), ctx(), base);
    expect(r.items).toEqual([]);
    expect(r).toMatchObject({ width: 0, height: 0, offset: { x: 0, y: 0 } });
  });
});

describe('layoutTitle — top (§4.5)', () => {
  it('stacks title over subtitle, hugging the top-left, offsetting content down', () => {
    const c = ctx();
    const r = layoutTitle(
      ast('Song', 'Sub'),
      c,
      settings({ titlePosition: 'top', titleLayout: 'stacked' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.x).toBe(0);
    expect(title?.y).toBeCloseTo(c.metrics.title.ascent);
    expect(title?.rotate).toBeUndefined();
    expect(subtitle?.x).toBe(0);
    expect(subtitle?.y).toBeGreaterThan(c.metrics.title.height); // below the title row
    expect(r.offset.x).toBe(0);
    expect(r.offset.y).toBeCloseTo(r.height + titleGap(c)); // region height + title gap
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
    expect(subtitle?.x).toBeCloseTo(4 * 14.4 + inlineGap()); // titleW + inline gap
  });
});

describe('layoutTitle — left spine (§4.5)', () => {
  it('rotates two parallel spines CCW, offsetting content to the right', () => {
    const c = ctx();
    const r = layoutTitle(
      ast('Song', 'Sub'),
      c,
      settings({ titlePosition: 'left', titleLayout: 'stacked' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.rotate).toBe(-90);
    expect(subtitle?.rotate).toBe(-90);
    expect(subtitle?.x).toBeGreaterThan(title?.x as number); // subtitle spine is inner
    expect(r.offset.y).toBe(0);
    expect(r.offset.x).toBeCloseTo(
      c.metrics.title.height + c.metrics.subtitle.height + titleGap(c),
    ); // both bands + gap
  });

  it('reads title then subtitle up one spine when inline', () => {
    const c = ctx();
    const r = layoutTitle(
      ast('Song', 'Sub'),
      c,
      settings({ titlePosition: 'left', titleLayout: 'inline' }),
    );
    const title = r.items.find((i) => i.role === 'title');
    const subtitle = r.items.find((i) => i.role === 'subtitle');
    expect(title?.x).toBeCloseTo(subtitle?.x as number); // one band
    expect(title?.y).toBeGreaterThan(subtitle?.y as number); // title sits below (read first)
    expect(r.offset.x).toBeCloseTo(c.metrics.title.height + titleGap(c)); // one band width + gap
  });
});

describe('layoutTitle — title only', () => {
  it('lays out a lone title with no subtitle item', () => {
    const r = layoutTitle(ast('Song'), ctx(), base);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ role: 'title', x: 0 });
  });
});
