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
//
// One thing every variant carries: the made-with mark. It is part of each
// variant's own drawing rather than something added afterwards — a line dropped
// into the margin under a finished composition is not a mark, it is an
// intrusion, and it looked like one. So `Drawing.mark` is **required**: a
// twenty-second variant does not compile until it has decided where its own
// mark goes, which is the only way "small, in a corner" can mean something
// different on a poster and on a spine.

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
  /** The made-with mark's size, as a multiple of the body role's. */
  markScale: 0.5,
  /** The air a mark keeps from an edge it is set against — the inside of a
   * frame, for the two variants that sign one. */
  markGapEm: 0.5,
} as const;

/** The paper a light render is drawn against — see {@link paperInk}. */
const LIGHT_PAPER = '#ffffff';

/**
 * What the made-with mark says.
 *
 * The host, not the app's name, and not "Made with Achordeon" either: a printed
 * sheet cannot be clicked, so the only mark that does anything is one somebody
 * can type back in. It is also the shortest form, which matters at half size.
 *
 * Not localized, and it is the one string here that never will be — a hostname
 * reads the same in every language, and `Achordeon` is the display spelling
 * everywhere anyway.
 */
export const MADE_WITH_MARK = 'achordeon.eu';

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

/** What a variant hands back: text, the rectangles under it, and its mark. */
interface Drawing {
  readonly items: TextItem[];
  readonly shapes: ShapeItem[];
  /** The made-with mark, placed by this variant — see the file header. */
  readonly mark: TextItem;
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

/**
 * The made-with mark, measured — a line like any other, which is the point.
 *
 * It is measured in the body role at {@link TITLE_PAGE.markScale}, so wherever a
 * variant decides to put it, it is a line it can stack, centre and align exactly
 * as it does the book's own. `gapBefore` is the air it wants when it is the last
 * line of a block; `fill` is for the variants that stand it on ink.
 */
function markLine(ctx: LayoutContext, gapBefore = 0, fill?: string): Line {
  return lineOf(
    ctx,
    MADE_WITH_MARK,
    'lyric',
    TITLE_PAGE.markScale,
    gapBefore,
    fill,
  );
}

/**
 * Stack a block whose last line is the mark, and hand the two back apart.
 *
 * The commonest answer by far, because it is the one that makes the mark part of
 * the composition rather than a thing beside it: the block is measured, centred
 * and aligned *including* the mark, so a variant that centres its book on the
 * page centres the book-and-its-imprint, and the sheet stays balanced.
 */
function stackWithMark(
  lines: readonly Line[],
  mark: Line,
  left: number,
  right: number,
  top: number,
  align: 'left' | 'center' | 'right',
): { items: TextItem[]; mark: TextItem } {
  const placed = placeLines([...lines, mark], left, right, top, align);
  return { items: placed.slice(0, -1), mark: placed[placed.length - 1] };
}

/** One line placed on its own — the mark, where it is not part of a block. */
function loneMark(
  mark: Line,
  left: number,
  right: number,
  top: number,
  align: 'left' | 'center' | 'right',
): TextItem {
  return placeLines([mark], left, right, top, align)[0];
}

/**
 * The top edge at which `line` shares `anchor`'s baseline.
 *
 * Two lines of different sizes hung from one top edge sit visibly askew; a
 * credit set against a name is one row read across, so it sits on the row's
 * line. Same reasoning as `column`'s author, and the mark needs it wherever it
 * shares a row with something bigger.
 */
function baselineTop(anchor: Line, anchorTop: number, line: Line): number {
  return anchorTop + anchor.ascent - line.ascent;
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
  // The mark is the imprint under the block, on the block's own left edge —
  // where a publisher's name goes on a title page, and the reason `classic` can
  // carry it without looking added to.
  const mark = markLine(ctx, TITLE_PAGE.blockGapEm * page.base);
  const blockW = Math.max(widestOf(lines), mark.width);
  const left = (page.width - blockW) / 2;
  const top = (page.height - stackHeight([...lines, mark])) / 2;
  return {
    ...stackWithMark(lines, mark, left, left + blockW, top, 'left'),
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
  const mark = markLine(ctx, TITLE_PAGE.blockGapEm * page.base);
  const top = (page.height - stackHeight([...lines, mark])) / 2;
  return {
    ...stackWithMark(lines, mark, page.left, page.right, top, 'center'),
    shapes: [],
  };
}

/** The book centred as one block, for the variants that frame it. */
function centredBook(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
): TextItem[] {
  const lines = bookLines(ctx, content, page);
  return placeLines(
    lines,
    page.left,
    page.right,
    (page.height - stackHeight(lines)) / 2,
    'center',
  );
}

/**
 * `minimal` — the title alone, at body size, in the top-left corner. Nothing
 * else of the book's is printed, including an author it has: the variant is the
 * claim that a front sheet can be one word in a corner. (The made-with mark is
 * not the book's and is added to every variant — {@link madeWithMark}.)
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
  const mark = markLine(ctx);
  return {
    items: placeLines([line], page.left, page.right, page.top, 'left'),
    // The other end of the one axis this variant has. The title holds the top of
    // the left margin; the mark holds the bottom of it, and the emptiness
    // between them is what the variant is for.
    mark: loneMark(
      mark,
      page.left,
      page.right,
      page.bottom - mark.height,
      'left',
    ),
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

  // The credit line at the foot: the author on the left, the mark against the
  // right edge, both on one baseline. A poster's small print is a row, not a
  // stack — and the author is measured against the room the mark leaves, so the
  // two share the line rather than fight over it.
  const mark = markLine(ctx);
  const gap = TITLE_PAGE.blockGapEm * page.base;
  if (content.author) {
    const author = fitted(
      ctx,
      content.author,
      'lyric',
      Math.max(0, page.innerW - mark.width - gap),
    );
    items.push(
      ...placeLines(
        [author],
        page.left,
        page.right,
        page.bottom - author.height,
        'left',
      ),
    );
    return {
      items,
      mark: loneMark(
        mark,
        page.left,
        page.right,
        baselineTop(author, page.bottom - author.height, mark),
        'right',
      ),
      shapes: [],
    };
  }
  return {
    items,
    mark: loneMark(
      mark,
      page.left,
      page.right,
      page.bottom - mark.height,
      'right',
    ),
    shapes: [],
  };
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
  // The mark closes the foot block, flush left with everything else — and it is
  // measured into `footH` before the words are sized, so the type shrinks to
  // leave room for it instead of the mark being squeezed in afterwards.
  const mark = markLine(
    ctx,
    foot.length > 0
      ? TITLE_PAGE.lineGapEm * page.base
      : TITLE_PAGE.blockGapEm * page.base,
  );
  const footH =
    stackHeight([...foot, mark]) + TITLE_PAGE.blockGapEm * page.base;

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
  const placed = stackWithMark(
    foot,
    mark,
    page.left,
    page.right,
    page.bottom - stackHeight([...foot, mark]),
    'left',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes: [] };
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

  // The foot of a hymnal's plate is one small centred block, so the mark joins
  // the author there rather than starting a second one.
  const foot: Line[] = content.author
    ? [fitted(ctx, content.author, 'lyric', page.innerW)]
    : [];
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const placed = stackWithMark(
    foot,
    mark,
    page.left,
    page.right,
    page.bottom - stackHeight([...foot, mark]),
    'center',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes: [] };
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

  let column = page.left + title.height;
  if (content.subtitle) {
    const sub = fitted(ctx, content.subtitle, 'subtitle', page.innerH);
    items.push({
      text: sub.text,
      x: column + sub.ascent,
      y: page.bottom,
      role: 'subtitle',
      rotate: -90,
      ...(sub.scale !== 1 ? { sizeScale: sub.scale } : {}),
    });
    column += sub.height;
  }

  // The mark takes the turn too, in the next column in from the title and
  // standing on the same foot. A single upright line reading the other way would
  // be the one thing on the sheet that made you turn your head back.
  const mark = markLine(ctx);

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

  return {
    items,
    mark: {
      text: mark.text,
      x: column + mark.ascent,
      y: page.bottom,
      role: 'lyric',
      rotate: -90,
      sizeScale: mark.scale,
    },
    shapes: [],
  };
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
  // The author and the mark close the page as one centred foot, under the ruled
  // block rather than beside it.
  const foot: Line[] = content.author
    ? [fitted(ctx, content.author, 'lyric', page.innerW)]
    : [];
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const placed = stackWithMark(
    foot,
    mark,
    page.left,
    page.right,
    page.bottom - stackHeight([...foot, mark]),
    'center',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes };
}

/**
 * The mark set just inside a frame's bottom edge, centred on it.
 *
 * Where an engraver signs a plate, and the one place a framed page can take it:
 * inside the block would break the frame's own emptiness, outside it would look
 * like something that missed the frame.
 */
function markInFrame(
  page: Page,
  ctx: LayoutContext,
  inset: number,
  stroke: number,
): TextItem {
  const mark = markLine(ctx);
  const foot = page.height - inset - stroke - TITLE_PAGE.markGapEm * page.base;
  return loneMark(
    mark,
    inset,
    page.width - inset,
    foot - mark.height,
    'center',
  );
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
  return {
    items: centredBook(page, ctx, content),
    mark: markInFrame(page, ctx, inset, stroke),
    shapes,
  };
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
  const paper = paperInk(ctx, isDark);
  const title = fitted(ctx, content.title, 'title', page.innerW, 0, paper);
  // The mark rides *in* the band, above the title and reversed out of it like
  // everything else printed there — a masthead line over the name, which is what
  // a band across the top of a sheet is asking for. The band grows by that line
  // rather than the line being fitted into the padding, so the air above and
  // below the title stays the air the variant chose.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base, paper);
  const bandY = page.height * TITLE_PAGE.bannerTopRatio;
  const bandH = mark.height + mark.gapBefore + title.height + pad * 2;
  const shapes: ShapeItem[] = [
    {
      x: 0,
      y: bandY,
      width: page.width,
      height: bandH,
      fill: ruleInk(ctx),
    },
  ];

  const markItem = loneMark(mark, page.left, page.right, bandY + pad, 'center');
  const items = placeLines(
    [title],
    page.left,
    page.right,
    bandY + pad + mark.height + mark.gapBefore,
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
  return { items, mark: markItem, shapes };
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

  // A ticket's small print is on the ticket. Inside the box, last, which also
  // means the box is measured around it and cannot end up too short for it.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const boxed = [...lines, mark];

  const boxW = Math.min(page.innerW, widestOf(boxed) + pad * 2);
  const boxH = stackHeight(boxed) + pad * 2;
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
    ...stackWithMark(lines, mark, boxX, boxX + boxW, boxY + pad, 'center'),
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
  // The last line of the block that stands on the corner, so the book still
  // stands on the corner — the emptiness above is the design, and a mark
  // anywhere else on this sheet would be a second thing in it.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  return {
    ...stackWithMark(
      lines,
      mark,
      page.left,
      page.right,
      page.bottom - stackHeight([...lines, mark]),
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
  const mark = markLine(ctx);
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
  return {
    items,
    // The third corner, and the one the variant left free: title top-left,
    // author bottom-right, mark bottom-left. It closes the left margin the title
    // opened, and the diagonal between the two big things stays empty.
    mark: loneMark(
      mark,
      page.left,
      page.right,
      page.bottom - mark.height,
      'left',
    ),
    shapes: [],
  };
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
  // The strapline under the masthead: the mark closes the title's column, on the
  // same left edge and inside the same ratio the title is held to, so the
  // author's column opposite is untouched.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const top = (page.height - stackHeight([...head, mark])) / 2;
  const placed = stackWithMark(
    head,
    mark,
    page.left,
    page.left + page.innerW * TITLE_PAGE.columnTitleRatio,
    top,
    'left',
  );
  const items = placed.items;
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
        baselineTop(head[0], top, author),
        'right',
      ),
    );
  }
  return { items, mark: placed.mark, shapes: [] };
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
  // Same foot as `rule`, for the same reason: the bill is the thing between the
  // bars, and what is under it is the small print.
  const foot: Line[] = content.author
    ? [fitted(ctx, content.author, 'lyric', page.innerW)]
    : [];
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const placed = stackWithMark(
    foot,
    mark,
    page.left,
    page.right,
    page.bottom - stackHeight([...foot, mark]),
    'center',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes };
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
  // Between the uprights, with them: the mark is inside the doorway, and the
  // uprights are measured to the block that now includes it, so the gate still
  // runs the height of what is standing in it and no further.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base);
  const height = stackHeight([...lines, mark]);
  const top = (page.height - height) / 2;

  const uprights: ShapeItem[] = [page.left, page.right - ruleW].map((x) => ({
    x,
    y: top - pad,
    width: ruleW,
    height: height + pad * 2,
    fill: ruleInk(ctx),
  }));

  return {
    ...stackWithMark(lines, mark, inner, outer, top, 'center'),
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
  return {
    items: centredBook(page, ctx, content),
    // Inside the inner frame, where the plate's maker signs it.
    mark: markInFrame(page, ctx, inner, stroke),
    shapes,
  };
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

  // The mark closes the block under the tag, in normal ink like the rest of it —
  // the box belongs to the title alone, which is the whole difference between
  // this variant and `banner`.
  const mark = markLine(
    ctx,
    below.length > 0
      ? TITLE_PAGE.lineGapEm * page.base
      : TITLE_PAGE.blockGapEm * page.base,
  );
  const stacked = [...below, mark];

  const boxH = title.height + padY * 2;
  const total = boxH + stackHeight(stacked) + stacked[0].gapBefore;
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
  const placed = stackWithMark(
    below,
    mark,
    page.left,
    page.right,
    top + boxH,
    'center',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes };
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
  const paper = paperInk(ctx, isDark);
  const title = fitted(ctx, content.title, 'title', page.innerW, 0, paper);
  const shapes: ShapeItem[] = [
    { x: 0, y: 0, width: page.width, height: bandH, fill: ruleInk(ctx) },
  ];

  // Reversed, at the head of the ink, on the same left edge the title sits on.
  // The fill is half the sheet and its top is the only part of it standing
  // empty; anything printed on the white below would be a third thing on a page
  // that is deliberately made of two.
  const mark = loneMark(
    markLine(ctx, 0, paper),
    page.left,
    page.right,
    page.top,
    'left',
  );

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
  return { items, mark, shapes };
}

/**
 * `bookmark` — a narrow strip of ink down the left edge, the book centred on
 * what is left of the page. The ribbon sewn into a spine.
 */
function bookmark(
  page: Page,
  ctx: LayoutContext,
  content: TitlePageContent,
  isDark: boolean,
): Drawing {
  const strip = page.width * TITLE_PAGE.bookmarkRatio;
  const left = strip + page.margin;
  const shapes: ShapeItem[] = [
    { x: 0, y: 0, width: strip, height: page.height, fill: ruleInk(ctx) },
  ];
  const lines = bookLines(ctx, content, page, Math.max(0, page.right - left));

  // Printed up the ribbon, reversed out of it — the strip is already a shape
  // with nothing on it, and a name down a spine is what ribbons carry. Centred
  // in the strip's width the way `spine` centres in its column: for `rotate:
  // -90` the anchor is the foot of the string, so `y` is where it ends.
  const mark = markLine(ctx, 0, paperInk(ctx, isDark));
  return {
    items: placeLines(
      lines,
      left,
      page.right,
      (page.height - stackHeight(lines)) / 2,
      'center',
    ),
    mark: {
      text: mark.text,
      x: (strip - mark.height) / 2 + mark.ascent,
      y: (page.height + mark.width) / 2,
      role: 'lyric',
      rotate: -90,
      sizeScale: mark.scale,
      ...(mark.fill ? { fill: mark.fill } : {}),
    },
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
  const paper = paperInk(ctx, isDark);
  const signature = content.author ?? content.title;
  const signed = fitted(ctx, signature, 'lyric', page.innerW, 0, paper);
  // Under the signature, inside the band: the book signs itself and then we do,
  // smaller. Both reversed, because both are on the ink — and the band grows to
  // hold the second line rather than the line being pushed into the padding.
  const mark = markLine(ctx, TITLE_PAGE.lineGapEm * page.base, paper);
  const bandH = stackHeight([signed, mark]) + pad * 2;
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
  const placed = stackWithMark(
    [signed],
    mark,
    page.left,
    page.right,
    bandY + pad,
    'center',
  );
  items.push(...placed.items);
  return { items, mark: placed.mark, shapes };
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
      return bookmark(page, ctx, content, isDark);
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
  const { items, shapes, mark } = draw(variant, page, ctx, content, isDark);
  // The variant decided where its mark goes; what it does not get a say in is
  // whether there is one. Last in `items`, and before the font book is built,
  // which is what subsets its letters into the PDF.
  const printed = [...items, mark];

  return {
    box: { width: page.width, height: page.height },
    fit: 1,
    origin: { x: 0, y: 0 },
    items: printed,
    ...(shapes.length > 0 ? { shapes } : {}),
    styles: ctx.styles,
    fonts: config.fonts
      ? buildFontBook(ctx.styles, config.fonts, printed)
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
