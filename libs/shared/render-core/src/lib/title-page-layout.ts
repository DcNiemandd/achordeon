// Title-page layout — the front sheet of a songbook, in twenty-one shapes
// Spec: PRD-RENDERING §4.1 (the render box), §5 (`RenderPlan`); board V2-05.
//
// A songbook's title page used to go through `layoutCore` as a song with no
// lines: a title block, centred by `RenderOpts.align`. That is the `classic`
// look and it is reproduced here exactly — but it was also the ceiling, because
// everything the song renderer can say about a page is "a title block, then
// content". A poster, a spine, a band across the top third are not that shape,
// which is why three of the four declared variants never landed.
//
// So this is a second, much smaller geometry pass with a different premise:
//
//   `layoutCore` measures the CONTENT and grows a box around it.
//   `layoutTitlePage` starts from the PAGE and places fields on it.
//
// That inversion is the whole file. A title page has four short strings and a
// sheet of paper, so absolute placement is the honest tool, and it is what makes
// "the frame sits a finger's width inside the page edge" a thing that can be
// written down at all.
//
// The page's short axis is `tuning.minBoxEm` — the same floor `fitContent` gives
// a song under `scale: 'auto'` — so a title page and the first song after it are
// set at the same size. Nothing here reads a per-song setting other than the
// aspect ratio and the padding: the book owns this sheet, not any song in it.

import type {
  GlobalSettings,
  TitlePageContent,
  TitlePageVariant,
} from '@achordeon/shared/domain';
import type {
  RenderOpts,
  RenderPlan,
  ShapeItem,
  TextItem,
  TextRole,
} from './render-plan';
import type { TextMeasurer } from './text-measurer';
import { resolveTuning, type RenderTuning, type DeepPartial } from './tuning';
import { EMPTY_FONT_BOOK, buildFontBook } from './fonts';
import { BUNDLED_CATALOG } from './font-catalog';
import { createContext, toFontSpec, type LayoutContext } from './context';
import { parseAspectRatio } from './aspect';
import type { LayoutConfig } from './layout';

/**
 * The magnitudes this file draws with. Author's constants in the sense
 * `RenderTuning` means it — taste, not policy — kept together so a variant reads
 * as placement rather than as arithmetic. Every one is a multiple of something:
 * `*Em` of the base size, the fractions of the printable box.
 */
const TITLE_PAGE = {
  /** The least air between the paper's edge and anything on it, in em. A song's
   * own `padding` may ask for more; it may not ask for less, because this sheet
   * is the book's rather than any song's. */
  marginEm: 1.5,
  /** Air between two lines of one block (title → subtitle). */
  lineGapEm: 0.35,
  /** Air between blocks — the author under a title, a subtitle under a rule. */
  blockGapEm: 1.2,
  /** A rule's thickness. */
  ruleEm: 0.125,
  /** A frame's and a ticket's stroke. */
  strokeEm: 0.09,
  /** How wide a rule is, as a fraction of the printable width — a floor, so a
   * short title still gets a line worth calling a rule. */
  ruleWidthRatio: 0.5,
  /** Where a `plate` title sits, as a fraction down the printable height. */
  plateTopRatio: 0.22,
  /** Where a `poster` title starts, likewise. */
  posterTopRatio: 0.18,
  /** A `poster` title never grows past this multiple of its natural size: a
   * one-word book should not print in letters the height of the page. */
  posterMaxScale: 4,
  /** How much of the printable height a `stacked` title is allowed to fill. */
  stackedFillRatio: 0.78,
  /** The band's top edge (fraction of the page) and the air inside it. */
  bannerTopRatio: 0.16,
  bannerPadEm: 1.1,
  /** How far the frame sits inside the margin, as a fraction of it. */
  frameInsetRatio: 0.55,
  /** The ticket's inner padding and its corner radius. */
  ticketPadEm: 1.4,
  ticketRadiusEm: 0.6,
  /** How much of the page `half` fills. */
  halfRatio: 0.5,
  /** The `bookmark` strip's width, as a fraction of the page. */
  bookmarkRatio: 0.055,
  /** The air inside `tag`'s box, horizontally and vertically. */
  tagPadXEm: 0.7,
  tagPadYEm: 0.35,
  /** The gap between `gate`'s uprights and the words between them, and the air
   * they stand above and below it. */
  gateGapEm: 0.9,
  gatePadEm: 0.5,
  /** The gap between `bookplate`'s two frames. */
  bookplateGapEm: 0.4,
  /** How much of the width `column` gives the title before the author's edge. */
  columnTitleRatio: 0.62,
} as const;

/** The paper a light render is drawn against — see {@link paperInk}. */
const LIGHT_PAPER = '#ffffff';

/** The sheet, and the rectangle a variant is allowed to draw in. */
interface Page {
  readonly width: number;
  readonly height: number;
  /** The inset. `left`/`top`/`right`/`bottom` are it, applied. */
  readonly margin: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly innerW: number;
  readonly innerH: number;
  /** `tuning.baseSizePx`, carried so a variant can size its air in em. */
  readonly base: number;
}

/** One string, measured at the size it will really be drawn. */
interface Line {
  readonly text: string;
  readonly role: TextRole;
  /** Multiple of the role's own size — 1 for a line drawn as the role sets it. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  /** Air above this line when it is stacked under another. */
  readonly gapBefore: number;
  /** Ink override — `banner` reverses its title out of the band. */
  readonly fill?: string;
}

/** What a variant hands back: text, and the rectangles under it. */
interface Drawing {
  readonly items: TextItem[];
  readonly shapes: ShapeItem[];
}

/** The ink a variant draws its rules and frames in: the title's own. */
function ruleInk(ctx: LayoutContext): string {
  return ctx.styles.title.fill;
}

/**
 * The colour of the paper *under* the render.
 *
 * A light plan carries no `paper` at all — it is transparent, and the medium
 * supplies the white (see `RenderPlan.paper`). So a variant that needs to know
 * what colour the page is has to be told, and this is the one place that
 * decides: white on paper, the dark page's own ground when the sheet is turned
 * over. Reversed-out text is the only thing that asks.
 */
function paperInk(ctx: LayoutContext, isDark: boolean): string {
  return isDark ? ctx.tuning.dark.paper : LIGHT_PAPER;
}

/** A string measured in `role` at `scale`. */
function lineOf(
  ctx: LayoutContext,
  text: string,
  role: TextRole,
  scale: number,
  gapBefore = 0,
  fill?: string,
): Line {
  const natural = ctx.measure.measure(text, toFontSpec(ctx.styles[role])).width;
  const m = ctx.metrics[role];
  return {
    text,
    role,
    scale,
    width: natural * scale,
    height: m.height * scale,
    ascent: m.ascent * scale,
    gapBefore,
    ...(fill ? { fill } : {}),
  };
}

/**
 * The scale at which `text` in `role` is exactly `avail` wide, capped at `max`.
 *
 * Advance widths are linear in font size, so measuring once at the role's own
 * size and scaling the answer is exact rather than an estimate — which is what
 * lets a title be shrunk to fit without a second measuring pass.
 */
function scaleToWidth(
  ctx: LayoutContext,
  text: string,
  role: TextRole,
  avail: number,
  max = 1,
): number {
  const natural = ctx.measure.measure(text, toFontSpec(ctx.styles[role])).width;
  if (natural <= 0 || avail <= 0) return max;
  return Math.min(max, avail / natural);
}

/** A line that has been shrunk if — and only if — it would not otherwise fit. */
function fitted(
  ctx: LayoutContext,
  text: string,
  role: TextRole,
  avail: number,
  gapBefore = 0,
  fill?: string,
): Line {
  return lineOf(
    ctx,
    text,
    role,
    scaleToWidth(ctx, text, role, avail),
    gapBefore,
    fill,
  );
}

function stackHeight(lines: readonly Line[]): number {
  return lines.reduce(
    (sum, line, i) => sum + line.height + (i > 0 ? line.gapBefore : 0),
    0,
  );
}

function widestOf(lines: readonly Line[]): number {
  return lines.reduce((w, line) => Math.max(w, line.width), 0);
}

/**
 * Stack `lines` between `left` and `right`, first baseline placed so the block
 * begins at `top`. Returns the items; the caller already knows the height.
 */
function placeLines(
  lines: readonly Line[],
  left: number,
  right: number,
  top: number,
  align: 'left' | 'center' | 'right',
): TextItem[] {
  const items: TextItem[] = [];
  let y = top;
  for (const [i, line] of lines.entries()) {
    if (i > 0) y += line.gapBefore;
    const x =
      align === 'center'
        ? (left + right - line.width) / 2
        : align === 'right'
          ? right - line.width
          : left;
    items.push({
      text: line.text,
      x,
      y: y + line.ascent,
      role: line.role,
      ...(line.scale !== 1 ? { sizeScale: line.scale } : {}),
      ...(line.fill ? { fill: line.fill } : {}),
    });
    y += line.height;
  }
  return items;
}

/**
 * The book as three lines — title, subtitle, author — each shrunk to the width
 * it is given. The shape most variants are a placement of.
 */
function bookLines(
  ctx: LayoutContext,
  content: TitlePageContent,
  page: Page,
  avail = page.innerW,
): Line[] {
  const lines: Line[] = [fitted(ctx, content.title, 'title', avail)];
  if (content.subtitle) {
    lines.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        avail,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  if (content.author) {
    lines.push(
      fitted(
        ctx,
        content.author,
        'lyric',
        avail,
        TITLE_PAGE.blockGapEm * page.base,
      ),
    );
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// The variants. Each is a pure function of the page, the styles and the book.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `classic` — the shipped look, and the reason this file reproduces rather than
 * replaces it: the three fields as one left-aligned block, the block centred on
 * the page. Left-aligned inside, centred outside; a book bound before any of
 * this existed prints the same sheet it always did.
 */
function classic(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const lines = bookLines(ctx, content, page);
  const blockW = widestOf(lines);
  const left = (page.width - blockW) / 2;
  const top = (page.height - stackHeight(lines)) / 2;
  return {
    items: placeLines(lines, left, left + blockW, top, 'left'),
    shapes: [],
  };
}

/** `centered` — the same three fields, but every line centred on its own. */
function centered(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const lines = bookLines(ctx, content, page);
  const top = (page.height - stackHeight(lines)) / 2;
  return {
    items: placeLines(lines, page.left, page.right, top, 'center'),
    shapes: [],
  };
}

/**
 * `minimal` — the title alone, at body size, in the top-left corner. Nothing
 * else is printed, including an author the book has: the variant is the claim
 * that a front sheet can be one word in a corner.
 */
function minimal(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const { typography } = ctx.tuning;
  // Body size expressed as a multiple of the title's, so it stays body size if
  // either factor is ever retuned.
  const small = typography.lyric.sizeFactor / typography.title.sizeFactor;
  const scale = Math.min(
    small,
    scaleToWidth(ctx, content.title, 'title', page.innerW, small),
  );
  const line = lineOf(ctx, content.title, 'title', scale);
  return {
    items: placeLines([line], page.left, page.right, page.top, 'left'),
    shapes: [],
  };
}

/**
 * `poster` — the title set as large as the width allows, high on the page, with
 * the author small at the foot. The gig poster: one thing to read from across a
 * room.
 */
function poster(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const scale = scaleToWidth(
    ctx,
    content.title,
    'title',
    page.innerW,
    TITLE_PAGE.posterMaxScale,
  );
  const head: Line[] = [lineOf(ctx, content.title, 'title', scale)];
  if (content.subtitle) {
    head.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  const top = page.top + page.innerH * TITLE_PAGE.posterTopRatio;
  const items = placeLines(head, page.left, page.right, top, 'left');
  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'left',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `stacked` — the title broken one word to a line, flush left, sized so the
 * words fill the height they are given. The book cover as typography.
 *
 * One scale for every word rather than one per word: words set to different
 * sizes read as emphasis nobody asked for, so the longest word decides and the
 * rest keep its size.
 */
function stacked(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const words = content.title.split(/\s+/).filter(Boolean);
  if (words.length === 0) return classic(page, ctx, content);

  const foot: Line[] = [];
  if (content.subtitle) {
    foot.push(fitted(ctx, content.subtitle, 'subtitle', page.innerW));
  }
  if (content.author) {
    foot.push(
      fitted(
        ctx,
        content.author,
        'lyric',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  const footH =
    foot.length > 0 ? stackHeight(foot) + TITLE_PAGE.blockGapEm * page.base : 0;

  // The scale is whichever runs out first: the width the longest word needs, or
  // the height all of them together are allowed.
  const byWidth = words.reduce(
    (s, word) =>
      Math.min(s, scaleToWidth(ctx, word, 'title', page.innerW, Infinity)),
    Infinity,
  );
  const room = (page.innerH - footH) * TITLE_PAGE.stackedFillRatio;
  const byHeight = room / (words.length * ctx.metrics.title.height);
  const scale = Math.max(0, Math.min(byWidth, byHeight));

  const lines = words.map((word) => lineOf(ctx, word, 'title', scale));
  const items = placeLines(lines, page.left, page.right, page.top, 'left');
  if (foot.length > 0) {
    items.push(
      ...placeLines(
        foot,
        page.left,
        page.right,
        page.bottom - stackHeight(foot),
        'left',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `plate` — a small centred title high on the page and the author low, with the
 * space between them left empty. The hymnal.
 */
function plate(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const head: Line[] = [fitted(ctx, content.title, 'title', page.innerW)];
  if (content.subtitle) {
    head.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  const items = placeLines(
    head,
    page.left,
    page.right,
    page.top + page.innerH * TITLE_PAGE.plateTopRatio,
    'center',
  );
  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'center',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `spine` — the title read up the left edge, the author in the bottom-right
 * corner. The same quarter turn the song renderer's title spine takes and the
 * same one a landscape page is laid down at (ADR-0013), so everything sideways
 * in Achordeon is read with one tilt of the head.
 *
 * `rotate: -90` turns about the item's own anchor and the string runs *upward*
 * from it, so the anchor is the string's foot: `y` is where it ends, not where
 * it starts, and `x` is the baseline the glyphs stand on.
 */
function spine(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const items: TextItem[] = [];
  const titleScale = scaleToWidth(ctx, content.title, 'title', page.innerH);
  const title = lineOf(ctx, content.title, 'title', titleScale);
  items.push({
    text: title.text,
    x: page.left + title.ascent,
    y: page.bottom,
    role: 'title',
    rotate: -90,
    ...(title.scale !== 1 ? { sizeScale: title.scale } : {}),
  });

  if (content.subtitle) {
    const sub = fitted(ctx, content.subtitle, 'subtitle', page.innerH);
    items.push({
      text: sub.text,
      x: page.left + title.height + sub.ascent,
      y: page.bottom,
      role: 'subtitle',
      rotate: -90,
      ...(sub.scale !== 1 ? { sizeScale: sub.scale } : {}),
    });
  }

  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'right',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `rule` — a title with a line drawn under it, the subtitle below the line and
 * the author at the foot. The first of the four that needs the rectangle: a rule
 * is a filled rect the thickness of a stroke.
 */
function rule(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const gap = TITLE_PAGE.lineGapEm * page.base;
  const title = fitted(ctx, content.title, 'title', page.innerW);
  const sub = content.subtitle
    ? fitted(ctx, content.subtitle, 'subtitle', page.innerW, gap)
    : undefined;
  const ruleH = TITLE_PAGE.ruleEm * page.base;
  const ruleW = Math.min(
    page.innerW,
    Math.max(title.width, page.innerW * TITLE_PAGE.ruleWidthRatio),
  );

  const total = title.height + gap + ruleH + (sub ? gap + sub.height : 0);
  const top = (page.height - total) / 2;

  const items = placeLines([title], page.left, page.right, top, 'center');
  const ruleY = top + title.height + gap;
  const shapes: ShapeItem[] = [
    {
      x: (page.width - ruleW) / 2,
      y: ruleY,
      width: ruleW,
      height: ruleH,
      fill: ruleInk(ctx),
    },
  ];
  if (sub) {
    items.push(
      ...placeLines([sub], page.left, page.right, ruleY + ruleH, 'center'),
    );
  }
  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'center',
      ),
    );
  }
  return { items, shapes };
}

/** `framed` — a thin border inset from the page edge, the block centred inside. */
function framed(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const inset = page.margin * TITLE_PAGE.frameInsetRatio;
  const stroke = TITLE_PAGE.strokeEm * page.base;
  const shapes: ShapeItem[] = [
    {
      x: inset,
      y: inset,
      width: page.width - inset * 2,
      height: page.height - inset * 2,
      stroke: ruleInk(ctx),
      strokeWidth: stroke,
    },
  ];
  return { ...centered(page, ctx, content), shapes };
}

/**
 * `banner` — the title reversed out of a filled band across the upper third,
 * the rest of the book underneath it in normal ink.
 *
 * The band runs edge to edge on purpose: a filled rectangle with a margin around
 * it reads as a mistake, and a title page is the one sheet in the book that can
 * afford to bleed.
 */
function banner(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  const pad = TITLE_PAGE.bannerPadEm * page.base;
  const title = fitted(
    ctx,
    content.title,
    'title',
    page.innerW,
    0,
    paperInk(ctx, isDark),
  );
  const bandY = page.height * TITLE_PAGE.bannerTopRatio;
  const bandH = title.height + pad * 2;
  const shapes: ShapeItem[] = [
    {
      x: 0,
      y: bandY,
      width: page.width,
      height: bandH,
      fill: ruleInk(ctx),
    },
  ];

  const items = placeLines(
    [title],
    page.left,
    page.right,
    bandY + pad,
    'center',
  );

  const below: Line[] = [];
  if (content.subtitle) {
    below.push(fitted(ctx, content.subtitle, 'subtitle', page.innerW));
  }
  if (content.author) {
    below.push(
      fitted(
        ctx,
        content.author,
        'lyric',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  if (below.length > 0) {
    items.push(
      ...placeLines(
        below,
        page.left,
        page.right,
        bandY + bandH + TITLE_PAGE.blockGapEm * page.base,
        'center',
      ),
    );
  }
  return { items, shapes };
}

/**
 * `ticket` — the whole book inside a small rounded box in the middle of the
 * page, with the song count under it. The one variant that prints how big the
 * book is, which is why the count is worded by the caller (see
 * `TitlePageContent.countLabel`).
 */
function ticket(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const pad = TITLE_PAGE.ticketPadEm * page.base;
  const avail = page.innerW - pad * 2;
  const lines = bookLines(ctx, content, page, avail);
  if (content.countLabel) {
    lines.push(
      fitted(
        ctx,
        content.countLabel,
        'sublabel',
        avail,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }

  const boxW = Math.min(page.innerW, widestOf(lines) + pad * 2);
  const boxH = stackHeight(lines) + pad * 2;
  const boxX = (page.width - boxW) / 2;
  const boxY = (page.height - boxH) / 2;

  const shapes: ShapeItem[] = [
    {
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      rx: TITLE_PAGE.ticketRadiusEm * page.base,
      stroke: ruleInk(ctx),
      strokeWidth: TITLE_PAGE.strokeEm * page.base,
    },
  ];
  return {
    items: placeLines(lines, boxX, boxX + boxW, boxY + pad, 'center'),
    shapes,
  };
}

/**
 * `baseline` — the whole book stood on the bottom-left corner, with the rest of
 * the sheet left empty above it. The Swiss cover: the emptiness is the design,
 * so nothing is centred and nothing is filled.
 */
function baseline(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const lines = bookLines(ctx, content, page);
  return {
    items: placeLines(
      lines,
      page.left,
      page.right,
      page.bottom - stackHeight(lines),
      'left',
    ),
    shapes: [],
  };
}

/**
 * `corner` — the title in the top-left, the author in the bottom-right, and the
 * diagonal between them left alone. Two marks as far apart as the paper allows.
 */
function corner(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const head: Line[] = [fitted(ctx, content.title, 'title', page.innerW)];
  if (content.subtitle) {
    head.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  const items = placeLines(head, page.left, page.right, page.top, 'left');
  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'right',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `column` — the title on the left of the page and the author against the right
 * edge on its own first line, as a masthead sets a name against a date.
 *
 * The title is held to `columnTitleRatio` of the width rather than the whole of
 * it, because the author has to have somewhere to be: a title free to run the
 * full width would meet it in the middle.
 */
function column(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const head: Line[] = [
    fitted(
      ctx,
      content.title,
      'title',
      page.innerW * TITLE_PAGE.columnTitleRatio,
    ),
  ];
  if (content.subtitle) {
    head.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW * TITLE_PAGE.columnTitleRatio,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  const top = (page.height - stackHeight(head)) / 2;
  const items = placeLines(head, page.left, page.right, top, 'left');
  if (content.author) {
    const author = fitted(
      ctx,
      content.author,
      'lyric',
      page.innerW * (1 - TITLE_PAGE.columnTitleRatio),
    );
    // On the title's own line, not under it: the two are one row read across —
    // so they share a BASELINE, not a top edge. The author is set smaller, and
    // two differently sized strings hung from the same top edge sit visibly
    // askew; sitting them on the same line is what makes the row one row.
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        top + head[0].ascent - author.ascent,
        'right',
      ),
    );
  }
  return { items, shapes: [] };
}

/**
 * `marquee` — the title between two full-width rules, the theatre bill. Twice
 * the `rule` gesture and a different one: a line under a title decorates it,
 * two lines around it announce it.
 */
function marquee(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const gap = TITLE_PAGE.lineGapEm * page.base;
  const ruleH = TITLE_PAGE.ruleEm * page.base;
  const title = fitted(ctx, content.title, 'title', page.innerW);
  const sub = content.subtitle
    ? fitted(ctx, content.subtitle, 'subtitle', page.innerW, gap)
    : undefined;

  const barred = ruleH + gap + title.height + gap + ruleH;
  const total = barred + (sub ? gap + sub.height : 0);
  const top = (page.height - total) / 2;

  const shapes: ShapeItem[] = [
    {
      x: page.left,
      y: top,
      width: page.innerW,
      height: ruleH,
      fill: ruleInk(ctx),
    },
    {
      x: page.left,
      y: top + barred - ruleH,
      width: page.innerW,
      height: ruleH,
      fill: ruleInk(ctx),
    },
  ];

  const items = placeLines(
    [title],
    page.left,
    page.right,
    top + ruleH + gap,
    'center',
  );
  if (sub) {
    items.push(
      ...placeLines([sub], page.left, page.right, top + barred + gap, 'center'),
    );
  }
  if (content.author) {
    const author = fitted(ctx, content.author, 'lyric', page.innerW);
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'center',
      ),
    );
  }
  return { items, shapes };
}

/**
 * `gate` — two uprights at the margins with the title standing between them.
 * The rules run the height of the block and no further, so the page reads as a
 * doorway rather than as a table.
 */
function gate(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const ruleW = TITLE_PAGE.ruleEm * page.base;
  const gateGap = TITLE_PAGE.gateGapEm * page.base;
  const pad = TITLE_PAGE.gatePadEm * page.base;
  const inner = page.left + ruleW + gateGap;
  const outer = page.right - ruleW - gateGap;

  const lines = bookLines(ctx, content, page, Math.max(0, outer - inner));
  const height = stackHeight(lines);
  const top = (page.height - height) / 2;

  const uprights: ShapeItem[] = [page.left, page.right - ruleW].map((x) => ({
    x,
    y: top - pad,
    width: ruleW,
    height: height + pad * 2,
    fill: ruleInk(ctx),
  }));

  return {
    items: placeLines(lines, inner, outer, top, 'center'),
    shapes: uprights,
  };
}

/**
 * `bookplate` — two frames, one just inside the other, with the book centred in
 * them. The ex-libris plate pasted inside a cover.
 */
function bookplate(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const stroke = TITLE_PAGE.strokeEm * page.base;
  const outer = page.margin * TITLE_PAGE.frameInsetRatio;
  const inner = outer + TITLE_PAGE.bookplateGapEm * page.base;
  const shapes: ShapeItem[] = [outer, inner].map((inset) => ({
    x: inset,
    y: inset,
    width: page.width - inset * 2,
    height: page.height - inset * 2,
    stroke: ruleInk(ctx),
    strokeWidth: stroke,
  }));
  return { ...centered(page, ctx, content), shapes };
}

/**
 * `tag` — the title alone in a filled box drawn tight around it, the rest of the
 * book beneath in normal ink. A band that stops at the words, where `banner`
 * runs off both edges of the paper.
 */
function tag(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  const padX = TITLE_PAGE.tagPadXEm * page.base;
  const padY = TITLE_PAGE.tagPadYEm * page.base;
  const title = fitted(
    ctx,
    content.title,
    'title',
    page.innerW - padX * 2,
    0,
    paperInk(ctx, isDark),
  );

  const below: Line[] = [];
  if (content.subtitle) {
    below.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW,
        TITLE_PAGE.blockGapEm * page.base,
      ),
    );
  }
  if (content.author) {
    below.push(
      fitted(
        ctx,
        content.author,
        'lyric',
        page.innerW,
        below.length > 0
          ? TITLE_PAGE.lineGapEm * page.base
          : TITLE_PAGE.blockGapEm * page.base,
      ),
    );
  }

  const boxH = title.height + padY * 2;
  const total =
    boxH + stackHeight(below) + (below.length > 0 ? below[0].gapBefore : 0);
  const top = (page.height - total) / 2;

  const shapes: ShapeItem[] = [
    {
      x: (page.width - (title.width + padX * 2)) / 2,
      y: top,
      width: title.width + padX * 2,
      height: boxH,
      fill: ruleInk(ctx),
    },
  ];

  const items = placeLines(
    [title],
    page.left,
    page.right,
    top + padY,
    'center',
  );
  if (below.length > 0) {
    items.push(
      ...placeLines(below, page.left, page.right, top + boxH, 'center'),
    );
  }
  return { items, shapes };
}

/**
 * `half` — the top half of the sheet filled solid, the title standing on the
 * bottom edge of the fill, the rest of the book underneath it. The loudest of
 * them, and the only one where the ink is most of the page.
 */
function half(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  const pad = TITLE_PAGE.bannerPadEm * page.base;
  const bandH = page.height * TITLE_PAGE.halfRatio;
  const title = fitted(
    ctx,
    content.title,
    'title',
    page.innerW,
    0,
    paperInk(ctx, isDark),
  );
  const shapes: ShapeItem[] = [
    { x: 0, y: 0, width: page.width, height: bandH, fill: ruleInk(ctx) },
  ];

  // Sat on the fill's own edge rather than centred in it: the title belongs to
  // the block of ink, and the empty half below is what it is being read against.
  const items = placeLines(
    [title],
    page.left,
    page.right,
    bandH - pad - title.height,
    'left',
  );

  const below: Line[] = [];
  if (content.subtitle) {
    below.push(fitted(ctx, content.subtitle, 'subtitle', page.innerW));
  }
  if (content.author) {
    below.push(
      fitted(
        ctx,
        content.author,
        'lyric',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  if (below.length > 0) {
    items.push(
      ...placeLines(
        below,
        page.left,
        page.right,
        bandH + TITLE_PAGE.blockGapEm * page.base,
        'left',
      ),
    );
  }
  return { items, shapes };
}

/**
 * `bookmark` — a narrow strip of ink down the left edge, the book centred on
 * what is left of the page. The ribbon sewn into a spine.
 */
function bookmark(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): Drawing {
  const strip = page.width * TITLE_PAGE.bookmarkRatio;
  const left = strip + page.margin;
  const shapes: ShapeItem[] = [
    { x: 0, y: 0, width: strip, height: page.height, fill: ruleInk(ctx) },
  ];
  const lines = bookLines(ctx, content, page, Math.max(0, page.right - left));
  return {
    items: placeLines(
      lines,
      left,
      page.right,
      (page.height - stackHeight(lines)) / 2,
      'center',
    ),
    shapes,
  };
}

/**
 * `footer` — the author in a band across the foot, the title above it on clean
 * paper. `banner` upside down, and it reads differently for it: the band at the
 * bottom signs the book rather than announcing it.
 */
function footer(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  const pad = TITLE_PAGE.bannerPadEm * page.base;
  const signature = content.author ?? content.title;
  const signed = fitted(
    ctx,
    signature,
    'lyric',
    page.innerW,
    0,
    paperInk(ctx, isDark),
  );
  const bandH = signed.height + pad * 2;
  const bandY = page.height - bandH;
  const shapes: ShapeItem[] = [
    { x: 0, y: bandY, width: page.width, height: bandH, fill: ruleInk(ctx) },
  ];

  const head: Line[] = [fitted(ctx, content.title, 'title', page.innerW)];
  if (content.subtitle) {
    head.push(
      fitted(
        ctx,
        content.subtitle,
        'subtitle',
        page.innerW,
        TITLE_PAGE.lineGapEm * page.base,
      ),
    );
  }
  // Centred in the paper the band leaves, not in the whole sheet.
  const items = placeLines(
    head,
    page.left,
    page.right,
    (bandY - stackHeight(head)) / 2,
    'center',
  );
  items.push(
    ...placeLines([signed], page.left, page.right, bandY + pad, 'center'),
  );
  return { items, shapes };
}

/**
 * The variant, drawn.
 *
 * A value this build has never heard of draws as `classic` rather than as
 * nothing: the list is additive (a book bound on a newer version syncs down
 * here), and a blank front sheet is the one outcome that looks like a bug.
 */
function draw(
  variant: TitlePageVariant,
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  switch (variant) {
    case 'centered':
      return centered(page, ctx, content);
    case 'minimal':
      return minimal(page, ctx, content);
    case 'poster':
      return poster(page, ctx, content);
    case 'stacked':
      return stacked(page, ctx, content);
    case 'plate':
      return plate(page, ctx, content);
    case 'spine':
      return spine(page, ctx, content);
    case 'rule':
      return rule(page, ctx, content);
    case 'framed':
      return framed(page, ctx, content);
    case 'banner':
      return banner(page, ctx, content, isDark);
    case 'ticket':
      return ticket(page, ctx, content);
    case 'baseline':
      return baseline(page, ctx, content);
    case 'corner':
      return corner(page, ctx, content);
    case 'column':
      return column(page, ctx, content);
    case 'marquee':
      return marquee(page, ctx, content);
    case 'gate':
      return gate(page, ctx, content);
    case 'bookplate':
      return bookplate(page, ctx, content);
    case 'tag':
      return tag(page, ctx, content, isDark);
    case 'half':
      return half(page, ctx, content, isDark);
    case 'bookmark':
      return bookmark(page, ctx, content);
    case 'footer':
      return footer(page, ctx, content, isDark);
    case 'classic':
    default:
      return classic(page, ctx, content);
  }
}

/** The sheet this book prints its front matter on. */
function pageFor(settings: GlobalSettings, tuning: RenderTuning): Page {
  const base = tuning.baseSizePx;
  const short = tuning.minBoxEm * base;
  const ratio = parseAspectRatio(settings.aspectRatio);
  const width = ratio >= 1 ? short * ratio : short;
  const height = ratio >= 1 ? short : short / ratio;
  // The song padding is a floor-raiser here, never a floor-lowerer: a song set
  // to no padding at all still gets a title page with air around it, because
  // this sheet belongs to the book (§4.11 owns the other case).
  const margin =
    Math.max(TITLE_PAGE.marginEm, Number(settings.padding) || 0) * base;
  return {
    width,
    height,
    margin,
    left: margin,
    top: margin,
    right: width - margin,
    bottom: height - margin,
    innerW: width - margin * 2,
    innerH: height - margin * 2,
    base,
  };
}

/**
 * A songbook's title page as a `RenderPlan` — the pure geometry, same contract
 * as `layoutCore`: no `@angular/*`, `measure` injected, nothing drawn.
 *
 * `fit` is 1 and `origin` is the corner, and that is not an oversight: every
 * item is already placed on the page in page coordinates, so there is no content
 * box to scale and nowhere to move it to. A title too wide for its margins is
 * shrunk where it is measured (`fitted`), which keeps the *page* the shape the
 * book asked for — the one thing the sheet must not lose, because the PDF lays
 * it on real paper by that shape.
 */
export function layoutTitlePageCore(
  content: TitlePageContent,
  variant: TitlePageVariant,
  settings: GlobalSettings,
  measure: TextMeasurer,
  opts: RenderOpts = {},
  config: LayoutConfig = {},
): RenderPlan {
  const tuning = resolveTuning(config.tuning as DeepPartial<RenderTuning>);
  const isDark = opts.dark ?? false;
  const ctx = createContext(
    settings,
    measure,
    tuning,
    false,
    isDark,
    config.catalog ?? BUNDLED_CATALOG,
  );
  const page = pageFor(settings, tuning);
  const { items, shapes } = draw(variant, page, ctx, content, isDark);

  return {
    box: { width: page.width, height: page.height },
    fit: 1,
    origin: { x: 0, y: 0 },
    items,
    ...(shapes.length > 0 ? { shapes } : {}),
    styles: ctx.styles,
    fonts: config.fonts
      ? buildFontBook(ctx.styles, config.fonts, items)
      : EMPTY_FONT_BOOK,
    ...(isDark ? { paper: tuning.dark.paper } : {}),
  };
}

/** A bound title-page layout — the measurer and platform config applied once. */
export type TitlePageLayout = (
  content: TitlePageContent,
  variant: TitlePageVariant,
  settings: GlobalSettings,
  opts?: RenderOpts,
) => RenderPlan;

/** Bind the platform measurer + config once; returns the per-render call. */
export function createTitlePageLayout(
  measure: TextMeasurer,
  config: LayoutConfig = {},
): TitlePageLayout {
  return (content, variant, settings, opts) =>
    layoutTitlePageCore(content, variant, settings, measure, opts, config);
}
