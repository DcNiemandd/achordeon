import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { singleFamilyResolver } from './fonts';
import { createLayout, layoutCore } from './layout';
import { DEFAULT_TUNING } from './tuning';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  titleFont: 'body',
  padding: 0,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#000000',
  chordSize: 1,
};
const measure = createFakeMeasurer();
const ast = (over: Partial<SongAst> = {}): SongAst => ({
  blocks: [],
  warnings: [],
  ...over,
});

/**
 * The auto-fit floor is off for the placement tests below.
 *
 * These fixtures are two-word songs, so the floor (`minBoxEm` on the short axis)
 * would be the only thing setting the box and every assertion about item coordinates
 * would be measuring the cap instead of the layout. It has its own test.
 */
const UNCAPPED = { tuning: { minBoxEm: 0 } };

describe('layoutCore — assembly (§1, §5)', () => {
  it('produces an empty plan for an empty song', () => {
    const plan = layoutCore(ast(), settings, measure);
    expect(plan.items).toEqual([]);
    expect(plan.box).toEqual({ width: 0, height: 0 });
    expect(plan.fit).toBe(1);
  });

  it('insets the content by the padding without reshaping the render box (§4.11)', () => {
    const song = ast({ blocks: [{ lines: [{ text: 'aa', chords: [] }] }] });
    const bare = layoutCore(song, settings, measure, {}, UNCAPPED);
    // 0.5em at base 16 = an 8px border on every side (the PoC's page padding).
    const padded = layoutCore(
      song,
      { ...settings, padding: 0.5 },
      measure,
      {},
      UNCAPPED,
    );

    const at = (p: typeof bare) => p.items.find((i) => i.role === 'lyric');
    expect(at(padded)?.x).toBeCloseTo((at(bare)?.x as number) + 8);
    expect(at(padded)?.y).toBeCloseTo((at(bare)?.y as number) + 8);

    // The content box grows by twice the padding on each axis, and the render
    // box still wraps it at the ratio the user asked for — padding lives INSIDE
    // the box, so it can never bend the page's shape.
    const ratio = (p: typeof bare) => p.box.width / p.box.height;
    expect(ratio(padded)).toBeCloseTo(ratio(bare));
    // This song is wider than A4, so width is the binding axis: it grows by 16
    // and the ratio then carries the height along with it.
    expect(padded.box.width).toBeCloseTo(bare.box.width + 16);
  });

  it('does not pad a song with nothing in it', () => {
    const plan = layoutCore(ast(), { ...settings, padding: 2 }, measure);
    expect(plan.box).toEqual({ width: 0, height: 0 });
  });

  it('caps how far auto-fit may magnify a short song (§4.1)', () => {
    const tiny = ast({ blocks: [{ lines: [{ text: 'aa', chords: [] }] }] });
    const plan = layoutCore(tiny, settings, measure);

    // The floor is on the short axis; A4 is portrait, so that is the width.
    expect(Math.min(plan.box.width, plan.box.height)).toBeCloseTo(
      DEFAULT_TUNING.minBoxEm * DEFAULT_TUNING.baseSizePx,
    );
    // The content itself did not move or grow — it gained blank page around it,
    // which is the whole point: a two-word song must not print an inch tall.
    expect(plan.items.find((i) => i.role === 'lyric')?.y).toBeCloseTo(12.8);
    // And the page is still the shape the user asked for.
    expect(plan.box.width / plan.box.height).toBeCloseTo(210 / 297);
  });

  it('does not cap a manually scaled song — the user overrode the fit', () => {
    const tiny = ast({ blocks: [{ lines: [{ text: 'aa', chords: [] }] }] });
    const plan = layoutCore(tiny, { ...settings, scale: 2 }, measure);
    expect(plan.box.width).toBeCloseTo(19.2);
    expect(plan.fit).toBe(2);
  });

  it('places the title region and offsets content below it (top)', () => {
    const plan = layoutCore(
      ast({ title: 'T', blocks: [{ lines: [{ text: 'aa', chords: [] }] }] }),
      settings,
      measure,
      {},
      UNCAPPED,
    );
    const title = plan.items.find((i) => i.role === 'title');
    const lyric = plan.items.find((i) => i.role === 'lyric');
    expect(title?.y).toBeCloseTo(19.2);
    // title region height (24) + gap (32) = 56, then lyric baseline 12.8
    expect(lyric?.y).toBeCloseTo(56 + 12.8);
    expect(plan.box.height).toBeCloseTo(72);
  });

  it('carries the resolved per-role styles', () => {
    const plan = layoutCore(ast({ title: 'T' }), settings, measure);
    expect(plan.styles.chord.fill).toBe('#000000');
    expect(plan.styles.title.weight).toBe('bold');
  });

  // §4.10: title and subtitle are ONE title block, so they take one face — and
  // choosing it must not disturb the font the song itself is set in.
  it('gives title and subtitle the titleFont, leaving the rest alone', () => {
    const body = layoutCore(ast({ title: 'T' }), settings, measure);
    expect(body.styles.title.family).toBe(body.styles.lyric.family);

    const serif = layoutCore(
      ast({ title: 'T' }),
      { ...settings, titleFont: 'serif' },
      measure,
    );
    expect(serif.styles.title.family).toBe(serif.styles.subtitle.family);
    expect(serif.styles.title.family).not.toBe(serif.styles.lyric.family);
    // The measurer and the emitter must name the SAME stack, or the geometry
    // describes a font the browser never draws with.
    expect(serif.styles.title.fallback).toBe(serif.styles.subtitle.fallback);
    expect(serif.styles.lyric.family).toBe(body.styles.lyric.family);
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

  it('asks the resolver for the faces the styles name', () => {
    const fonts = singleFamilyResolver(DEFAULT_TUNING.fontFamily, {
      normal: 'QUJD',
    });
    const plan = layoutCore(
      ast({ title: 'T' }),
      settings,
      measure,
      {},
      { fonts },
    );
    // Only the faces the styles name, and only the ones with bytes: the lyric
    // face is `normal`, so the bold roles find nothing and are left out.
    expect(plan.fonts).toEqual([
      {
        family: DEFAULT_TUNING.fontFamily,
        weight: 'normal',
        style: 'normal',
        base64: 'QUJD',
      },
    ]);
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
