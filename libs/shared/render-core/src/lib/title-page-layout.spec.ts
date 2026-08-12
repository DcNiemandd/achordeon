import type {
  GlobalSettings,
  TitlePageContent,
  TitlePageVariant,
} from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { MADE_WITH_MARK, layoutTitlePageCore } from './title-page-layout';
import { DEFAULT_TUNING } from './tuning';
import { A4_RATIO } from './aspect';
import type { RenderPlan } from './render-plan';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  bodyFont: 'roboto-mono',
  italicFont: 'roboto-mono',
  titleFont: 'body',
  padding: 0,
  blockGap: DEFAULT_TUNING.spacing.interBlockGapFactor,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#000000',
  chordSize: 1,
  notation: 'english',
};

const measure = createFakeMeasurer();

const book: TitlePageContent = {
  title: 'Songs',
  subtitle: 'for the fire',
  author: 'M. M.',
  countLabel: '12 songs',
};

/** Every variant the union names — the list each test below sweeps. */
const ALL: readonly TitlePageVariant[] = [
  'classic',
  'centered',
  'minimal',
  'poster',
  'stacked',
  'plate',
  'spine',
  'baseline',
  'corner',
  'column',
  'rule',
  'framed',
  'banner',
  'ticket',
  'marquee',
  'gate',
  'bookplate',
  'tag',
  'half',
  'bookmark',
  'footer',
];

const layout = (
  variant: TitlePageVariant,
  content: TitlePageContent = book,
  over: Partial<GlobalSettings> = {},
): RenderPlan =>
  layoutTitlePageCore(
    content,
    variant,
    { ...settings, ...over },
    measure,
    {},
    {},
  );

/**
 * The book's own items — the plan without the made-with mark every variant now
 * carries. Assertions about a *variant* are written against these, so the mark
 * is tested once, below, instead of once per variant.
 */
const bookItems = (plan: RenderPlan) =>
  plan.items.filter((item) => item.text !== MADE_WITH_MARK);

const markOf = (plan: RenderPlan) =>
  plan.items.find((item) => item.text === MADE_WITH_MARK);

/** The page every assertion below is written against (see `pageFor`). */
const SHORT = DEFAULT_TUNING.minBoxEm * DEFAULT_TUNING.baseSizePx;
const PAGE = { width: SHORT, height: SHORT / A4_RATIO };

describe('layoutTitlePageCore — the page', () => {
  it('makes the box the paper, not a box around the words', () => {
    // The whole inversion against `layoutCore`, in one assertion: two words and
    // a long title get the identical sheet, because the sheet is the book's.
    const short = layout('centered', { title: 'A' });
    const long = layout('centered', {
      title: 'A title long enough to need shrinking to fit its own margins',
    });
    expect(short.box).toEqual(PAGE);
    expect(long.box).toEqual(PAGE);
    expect(short.fit).toBe(1);
    expect(short.origin).toEqual({ x: 0, y: 0 });
  });

  it('takes its shape from the aspect ratio, landscape included', () => {
    const wide = layout('centered', book, { aspectRatio: '2:1' });
    expect(wide.box).toEqual({ width: SHORT * 2, height: SHORT });
  });

  it('keeps a margin the song padding cannot take away', () => {
    // `padding: 0` above — a title page still gets air, because the sheet
    // belongs to the book rather than to any song's setting.
    const plan = layout('minimal');
    expect(plan.items[0].x).toBeGreaterThan(0);
  });

  it('lets a larger padding widen the margin', () => {
    const tight = layout('minimal');
    const roomy = layout('minimal', book, { padding: 6 });
    expect(roomy.items[0].x).toBeGreaterThan(tight.items[0].x);
  });

  it('shrinks a title that would not fit rather than letting it bleed', () => {
    const plan = layout('centered', {
      title: 'A title far too long to sit inside the margins at its own size',
    });
    const title = plan.items[0];
    expect(title.sizeScale).toBeLessThan(1);
    expect(title.x).toBeGreaterThanOrEqual(0);
  });
});

describe('layoutTitlePageCore — every variant', () => {
  it.each(ALL)('draws the title (%s)', (variant) => {
    const plan = layout(variant);
    expect(plan.items.some((it) => it.text === 'Songs')).toBe(true);
  });

  it.each(ALL)('keeps everything on the paper (%s)', (variant) => {
    const plan = layout(variant);
    for (const item of plan.items) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(plan.box.width);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThanOrEqual(plan.box.height);
    }
    for (const shape of plan.shapes ?? []) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + shape.width).toBeLessThanOrEqual(plan.box.width + 1e-9);
      expect(shape.y + shape.height).toBeLessThanOrEqual(
        plan.box.height + 1e-9,
      );
    }
  });

  it.each(ALL)('survives a book with only a title (%s)', (variant) => {
    const plan = layout(variant, { title: 'Songs' });
    expect(plan.items.length).toBeGreaterThan(0);
  });

  it('draws an unknown variant as classic rather than as nothing', () => {
    const unknown = layout('what-is-this' as TitlePageVariant);
    expect(unknown.items).toEqual(layout('classic').items);
  });
});

describe('layoutTitlePageCore — what each variant is', () => {
  it('classic left-aligns inside the block and centres the block', () => {
    const plan = layout('classic');
    const [title, subtitle] = plan.items;
    expect(title.x).toBe(subtitle.x);
  });

  it('centered centres each line on its own', () => {
    const plan = layout('centered');
    const [title, subtitle] = plan.items;
    expect(title.x).not.toBe(subtitle.x);
    // Each line's own midpoint is the page's.
    for (const item of plan.items) {
      const width = measure.measure(item.text, {
        family: 'x',
        sizePx: plan.styles[item.role].sizePx * (item.sizeScale ?? 1),
        weight: 'normal',
      }).width;
      expect(item.x + width / 2).toBeCloseTo(plan.box.width / 2, 6);
    }
  });

  it('minimal prints the title and nothing else of the book', () => {
    const plan = layout('minimal');
    expect(bookItems(plan)).toHaveLength(1);
    expect(plan.items[0].sizeScale).toBeLessThan(1);
  });

  it('poster sets the title larger than the role does', () => {
    const plan = layout('poster', { title: 'Fire' });
    expect(plan.items[0].sizeScale).toBeGreaterThan(1);
  });

  it('stacked puts one word on each line, all at one size', () => {
    const plan = layout('stacked', { title: 'Songs for the fire' });
    const words = plan.items.slice(0, 4);
    expect(words.map((w) => w.text)).toEqual(['Songs', 'for', 'the', 'fire']);
    expect(new Set(words.map((w) => w.sizeScale)).size).toBe(1);
    // Flush left, and descending the page.
    expect(new Set(words.map((w) => w.x)).size).toBe(1);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].y).toBeGreaterThan(words[i - 1].y);
    }
  });

  it('spine turns the title a quarter, the way a landscape page turns', () => {
    const plan = layout('spine');
    expect(plan.items[0].rotate).toBe(-90);
  });

  it('rule draws its line under the title', () => {
    const plan = layout('rule');
    const [line] = plan.shapes ?? [];
    expect(line.fill).toBe(plan.styles.title.fill);
    expect(line.y).toBeGreaterThan(plan.items[0].y);
  });

  it('framed strokes a border and fills nothing', () => {
    const [frame] = layout('framed').shapes ?? [];
    expect(frame.stroke).toBeDefined();
    expect(frame.fill).toBeUndefined();
  });

  it('banner reverses the title out of a filled band', () => {
    const plan = layout('banner');
    const [band] = plan.shapes ?? [];
    const title = plan.items[0];
    expect(band.fill).toBe(plan.styles.title.fill);
    expect(band.width).toBe(plan.box.width); // edge to edge, on purpose
    expect(title.fill).toBe('#ffffff');
    // Inside the band, not merely near it.
    expect(title.y).toBeGreaterThan(band.y);
    expect(title.y).toBeLessThan(band.y + band.height);
  });

  it('banner reverses against the dark page when the sheet is turned over', () => {
    const plan = layout('banner');
    const dark = layoutTitlePageCore(book, 'banner', settings, measure, {
      dark: true,
    });
    expect(dark.items[0].fill).toBe(DEFAULT_TUNING.dark.paper);
    expect(dark.items[0].fill).not.toBe(plan.items[0].fill);
  });

  it('ticket boxes the book and prints how big it is', () => {
    const plan = layout('ticket');
    const [box] = plan.shapes ?? [];
    expect(box.rx).toBeGreaterThan(0);
    expect(plan.items.map((it) => it.text)).toContain('12 songs');
    for (const item of bookItems(plan)) {
      expect(item.x).toBeGreaterThanOrEqual(box.x);
      expect(item.y).toBeGreaterThan(box.y);
      expect(item.y).toBeLessThan(box.y + box.height);
    }
  });

  it('ticket says nothing about the size of a book it was not told', () => {
    const plan = layout('ticket', { title: 'Songs' });
    expect(bookItems(plan)).toHaveLength(1);
  });

  it('baseline stands the block on the bottom-left corner', () => {
    const plan = layout('baseline');
    const items = bookItems(plan);
    const last = items[items.length - 1];
    expect(new Set(items.map((it) => it.x)).size).toBe(1);
    expect(last.y).toBeGreaterThan(plan.box.height * 0.8);
  });

  it('corner puts the two marks on opposite ones', () => {
    const plan = layout('corner');
    const items = bookItems(plan);
    const title = items[0];
    const author = items[items.length - 1];
    expect(title.y).toBeLessThan(plan.box.height / 2);
    expect(author.y).toBeGreaterThan(plan.box.height / 2);
    expect(author.x).toBeGreaterThan(title.x);
  });

  it('column sets the author against the right edge on the title line', () => {
    const plan = layout('column');
    const items = bookItems(plan);
    const title = items[0];
    const author = items[items.length - 1];
    expect(author.y).toBe(title.y);
    expect(author.x).toBeGreaterThan(plan.box.width / 2);
  });

  it('marquee rules the title above and below, full width', () => {
    const plan = layout('marquee');
    const [above, below] = plan.shapes ?? [];
    const title = plan.items[0];
    expect(above.width).toBe(below.width);
    expect(above.y).toBeLessThan(title.y);
    expect(below.y).toBeGreaterThan(title.y);
  });

  it('gate stands an upright at each margin', () => {
    const plan = layout('gate');
    const [left, right] = plan.shapes ?? [];
    expect(left.height).toBe(right.height);
    expect(left.x).toBeLessThan(plan.items[0].x);
    expect(right.x).toBeGreaterThan(plan.items[0].x);
  });

  it('bookplate draws one frame inside the other', () => {
    const [outer, inner] = layout('bookplate').shapes ?? [];
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.width).toBeLessThan(outer.width);
    expect(outer.fill).toBeUndefined();
  });

  it('tag boxes the title only, and stops at it', () => {
    const plan = layout('tag');
    const [box] = plan.shapes ?? [];
    const title = plan.items[0];
    expect(box.width).toBeLessThan(plan.box.width); // unlike banner, which bleeds
    expect(title.fill).toBe('#ffffff');
    expect(plan.items[1].fill).toBeUndefined(); // the rest is normal ink
  });

  it('half fills the top of the page and stands the title on its edge', () => {
    const plan = layout('half');
    const [band] = plan.shapes ?? [];
    const title = plan.items[0];
    expect(band.height).toBeCloseTo(plan.box.height / 2, 6);
    expect(title.fill).toBe('#ffffff');
    expect(title.y).toBeLessThan(band.height);
    expect(title.y).toBeGreaterThan(band.height * 0.7);
  });

  it('bookmark strips the left edge and centres on what is left', () => {
    const plan = layout('bookmark');
    const [strip] = plan.shapes ?? [];
    expect(strip.x).toBe(0);
    expect(strip.height).toBe(plan.box.height);
    for (const item of bookItems(plan)) {
      expect(item.x).toBeGreaterThan(strip.width);
    }
  });

  it('footer signs the book in a band at the foot', () => {
    const plan = layout('footer');
    const items = bookItems(plan);
    const [band] = plan.shapes ?? [];
    const signed = items[items.length - 1];
    expect(band.y + band.height).toBeCloseTo(plan.box.height, 6);
    expect(signed.text).toBe('M. M.');
    expect(signed.fill).toBe('#ffffff');
    expect(items[0].y).toBeLessThan(band.y);
  });
});

describe('layoutTitlePageCore — the made-with mark', () => {
  it.each(ALL)('is on the sheet whatever the variant is (%s)', (variant) => {
    expect(markOf(layout(variant))).toBeDefined();
  });

  it('is set smaller than the body it shares a role with', () => {
    expect(markOf(layout('classic'))?.sizeScale).toBeLessThan(1);
  });

  it('takes the alignment of the block it belongs to', () => {
    // `classic` is a left-aligned block centred on the sheet, so its imprint
    // hangs off the same left edge — the mark is part of the composition, which
    // is the whole difference from a line dropped into the margin.
    const classic = layout('classic');
    expect(markOf(classic)?.x).toBe(classic.items[0].x);
    expect(markOf(classic)?.y).toBeGreaterThan(
      classic.items[classic.items.length - 2].y,
    );

    // `centered` centres it, like every other line it sets.
    const centered = layout('centered');
    const mark = markOf(centered);
    const width = measure.measure(MADE_WITH_MARK, {
      family: 'x',
      sizePx: centered.styles.lyric.sizePx * (mark?.sizeScale ?? 1),
      weight: 'normal',
    }).width;
    expect((mark?.x ?? 0) + width / 2).toBeCloseTo(centered.box.width / 2, 6);
  });

  it('turns with the variants that are read sideways', () => {
    expect(markOf(layout('spine'))?.rotate).toBe(-90);
    expect(markOf(layout('bookmark'))?.rotate).toBe(-90);
  });

  it('is reversed out wherever its variant stood it on ink', () => {
    // Each of these puts the mark inside a fill of its own — the band, the
    // ribbon, the half sheet — so it is the paper's colour, like the title.
    for (const variant of ['banner', 'footer', 'half', 'bookmark'] as const) {
      expect(markOf(layout(variant))?.fill).toBe('#ffffff');
    }
    // And is plain ink wherever it is on paper.
    expect(markOf(layout('classic'))?.fill).toBeUndefined();
    expect(markOf(layout('framed'))?.fill).toBeUndefined();
  });

  it('reverses against the dark page, like every other reversed line', () => {
    const dark = layoutTitlePageCore(book, 'footer', settings, measure, {
      dark: true,
    });
    expect(markOf(dark)?.fill).toBe(DEFAULT_TUNING.dark.paper);
  });

  it('sits inside the frame that a framed page draws', () => {
    const plan = layout('framed');
    const [frame] = plan.shapes ?? [];
    const mark = markOf(plan);
    expect(mark?.y).toBeGreaterThan(frame.y);
    expect(mark?.y).toBeLessThan(frame.y + frame.height);
    // Below the book, which is centred — it signs the plate rather than joining it.
    for (const item of bookItems(plan)) {
      expect(item.y).toBeLessThan(mark?.y ?? 0);
    }
  });

  it('is inside the band a banner draws, not under it', () => {
    const plan = layout('banner');
    const [band] = plan.shapes ?? [];
    const mark = markOf(plan);
    expect(mark?.y).toBeGreaterThan(band.y);
    expect(mark?.y).toBeLessThan(band.y + band.height);
    // Above the title: a masthead line over the name.
    expect(mark?.y).toBeLessThan(plan.items[0].y);
  });
});

describe('layoutTitlePageCore — the plan it hands back', () => {
  it('carries no shapes at all for a variant that draws none', () => {
    // The rule that keeps a song a document: `shapes` is absent, not empty.
    expect(layout('classic').shapes).toBeUndefined();
  });

  it('carries the dark ground only when the page is turned over', () => {
    expect(layout('classic').paper).toBeUndefined();
    expect(
      layoutTitlePageCore(book, 'classic', settings, measure, { dark: true })
        .paper,
    ).toBe(DEFAULT_TUNING.dark.paper);
  });
});
