// Summary (contents) layout — Epic 7 ▸ subtask 6
// Spec: PRD-INFRASTRUCTURE.md §8 (the songbook PDF), CONTEXT.md §Download
// ("Songbook download — a PDF"), §Songbook (an Entry is a positioned slot, and
// the summary is the list of those positions).
//
// The summary is the one page of the book that is NOT a render: it is a list of
// names against page numbers, and a page number is only knowable after the
// pagination is decided (see `DownloadService.drawSummary`). So it is drawn as
// PDF text — which means nothing above it knows where a line lands unless the
// arithmetic lives somewhere with a right and a wrong answer. That is this file,
// the sibling of `page-geometry`: pure points-in, points-out, no jsPDF, no DOM.
//
// **Why two columns.** One column of ~35 lines wastes half of an A4 on white
// paper and sends a forty-song book onto a second sheet it does not need. Two
// columns double the capacity of every sheet at no cost in type size, which is
// the whole point of a contents page: the reader is scanning, not reading.
//
// **Why the wide gutter.** An entry is `title · · · number`, the number sitting at
// the RIGHT edge of its column, because that is where a reader's eye goes for a
// page reference. Set two of those side by side at an ordinary column gap and
// column one's numbers end up a hair's breadth from column two's titles — the
// digits read as a prefix of the wrong entry ("42 Wonderwall"). The break
// between columns therefore has to be visibly wider than the break inside an
// entry, so the eye groups `title…number` as one thing and the columns as two.
// `gutterEm` is three times `entryGapEm` for exactly that reason.
//
// **Why the number can change sides.** `SummaryNumberPlace` turns the entry
// around: `7.  title`, the hymnal's form, with the numbers in a column of their
// own and every title indented past the widest of them. It exists because the
// number a songbook prints on a song's page is its page number, so a contents
// page that leads with the number AND ends with it says the same thing twice on
// every row.
//
// Units are PostScript points (1/72"), like everything else the PDF path speaks.

import type { Size } from './page-geometry';

/**
 * Which side of the title the number sits on.
 *
 * `after` is the reference table: `title · · · · 7`, the number against the
 * column's right edge under a run of leader dots, which is what a reader's eye
 * runs along to find a page. `before` is the hymnal: `7.  title`, the number
 * leading the line and every title indented to a common left edge, which is what
 * a reader uses when they already have a number and want the name.
 *
 * They are alternatives rather than a pair, and that is the point: the songbook
 * numbers each song by its page, so printing the number on both sides of the
 * same line puts the same digits twice on every row.
 */
export type SummaryNumberPlace = 'before' | 'after';

/** One line of the contents list: what it is called, and what it is numbered. */
export interface SummaryItem {
  /** The song's printed title (its library name where it has no title yet). */
  readonly title: string;
  /** The page reference, already rendered as text — the caller owns the
   * numbering scheme (front matter carries no number, so it is not the sheet). */
  readonly number: string;
}

/**
 * The measurement seam, in the shape the PDF can actually answer.
 *
 * Mirrors `TextMeasurer` (PRD-RENDERING §5, ADR-0008): the geometry never
 * touches the device. It is deliberately NOT that interface — jsPDF measures
 * with the font it currently has set and knows nothing of a `FontSpec`'s family,
 * weight or CSS fallback stack, so asking for one here would be asking the
 * caller to invent three fields nobody reads. Width at a size is the whole
 * question. Tests bind it to `createFakeMeasurer` and get hand-computable
 * columns out.
 */
export type MeasureText = (text: string, fontSize: number) => number;

/**
 * The magnitudes of the contents page. Internal tuning in the spirit of
 * `RenderTuning` — a dev's control surface, never a user setting.
 *
 * Naming convention, as in the renderer: `*Em` is a multiple of the summary's
 * own font size (horizontal whitespace), `*Lines` a multiple of the line pitch.
 */
export const SUMMARY_TUNING = {
  /** Line pitch as a fraction of the page height — ~40 lines to a sheet. */
  linesPerSheet: 40,
  /** …but never smaller than this, or an A6 booklet's contents turn to dust. */
  minLinePitchPt: 12,
  /** Cap height of the type, × the line pitch: 70% pitch, 30% leading. */
  fontRatio: 0.7,
  /** Blank line pitches above the first entry, so the list is not welded to the
   * page edge. Kept at the historical 2 — it is the breathing room the
   * single-column summary already had. */
  headRoomLines: 2,
  /** Gap between a title and ITS OWN number, × the font size. One em: enough
   * that the two do not touch, tight enough that they read as one entry. */
  entryGapEm: 1,
  /** Gap between one column and the next, × the font size. Three ems — three
   * times the gap inside an entry, which is what makes the column break the
   * stronger of the two boundaries rather than a coin toss for the eye. */
  gutterEm: 3,
  /** A column narrower than this is not a column, it is a stack of ellipses. A
   * page that cannot afford two of them keeps one. */
  minColumnEm: 10,
  /** Columns the contents page will split into at most. Two is the whole ask:
   * three would take the title room below `minColumnEm` on A5 and turn most
   * titles into stubs. */
  maxColumns: 2,
  /** Clear space at each end of a run of leader dots, × the font size. Half an
   * em a side, so the dots stop short of both the title and the number and the
   * two still read as one entry — the same one em in total that the bare gap
   * used to be. */
  leaderGapEm: 0.5,
  /** Fewer dots than this is not a leader, it is a full stop after the title. */
  minLeaderDots: 2,
} as const;

/** What one glyph of "there is more here" costs. */
const ELLIPSIS = '…';

/** The leader's unit. A run of these is what the eye follows to the number. */
const DOT = '.';

/** The page's arithmetic, before any text has been measured. */
export interface SummaryMetrics {
  /** Baseline-to-baseline distance. */
  readonly linePitch: number;
  readonly fontSize: number;
  /** y of the first baseline on every summary page. */
  readonly top: number;
  /** Entries one column holds on one page. */
  readonly rows: number;
  readonly columns: number;
  readonly columnWidth: number;
  /** Whitespace between two columns — the wide break. */
  readonly gutter: number;
  /** Whitespace between a title and its own number — the tight break. */
  readonly entryGap: number;
  /** Entries one whole page holds: `rows × columns`. */
  readonly perPage: number;
}

/** One entry, placed. Coordinates are absolute on the page, in points. */
export interface SummaryPlacement {
  /** Index into the items array — the caller's link target depends on it. */
  readonly index: number;
  /** 0-based summary page. */
  readonly page: number;
  /** 0-based column within that page. */
  readonly column: number;
  /** 0-based row within that column. */
  readonly row: number;
  /** The title as it will be drawn — truncated if it did not fit. */
  readonly title: string;
  readonly isTruncated: boolean;
  /** The page reference **as it is drawn** — bare digits against the right edge,
   * or `7.` in front of the title, where the period matches the number the song's
   * own page carries. The caller draws this, not the item's own field. */
  readonly number: string;
  /** Left edge of the title. In `before` mode this is the common indent every
   * title shares, which is what the whitespace after the number pays for. */
  readonly titleX: number;
  /** The number's edge at `numberAlign`: the column's right edge going `after`
   * the title, its left edge coming `before` it. */
  readonly numberX: number;
  /** How to draw the number at `numberX`. */
  readonly numberAlign: 'left' | 'right';
  /** The run of dots between the title and its number — empty in `before` mode
   * (there is nothing to lead to) and whenever there is no room for a run worth
   * the name. Drawn left-aligned at `leaderX`. */
  readonly leader: string;
  /** Left edge of the leader. Meaningless while `leader` is empty. */
  readonly leaderX: number;
  readonly y: number;
}

export interface SummaryLayout {
  readonly metrics: SummaryMetrics;
  /** Sheets the summary occupies. **0 for an empty book** — a contents page
   * listing nothing is not front matter, it is a blank sheet the page numbering
   * would then have to count past. */
  readonly pages: number;
  readonly placements: readonly SummaryPlacement[];
}

/**
 * How many columns `count` entries deserve on this page.
 *
 * **A short book stays in one column.** Two columns exist to buy vertical room;
 * when one column already holds the whole book there is no room to buy, and a
 * three-song list split across half a sheet of paper reads as a layout that
 * broke rather than a contents page. So the split only happens once the list
 * would overflow a single column — and then, having decided to split, the page
 * still balances the entries evenly (see `layoutSummary`), so the trigger case
 * comes out as 18 + 17 rather than 35 + 1.
 *
 * The width check is the second veto: a page that cannot give both columns a
 * usable title width would only be trading white space for ellipses.
 */
function chooseColumns(
  count: number,
  rows: number,
  usableWidth: number,
  gutter: number,
  minColumnWidth: number,
): number {
  if (count <= rows) return 1;
  const split = (usableWidth - gutter) / SUMMARY_TUNING.maxColumns;
  return split >= minColumnWidth ? SUMMARY_TUNING.maxColumns : 1;
}

/**
 * The contents page's geometry for a book of `count` entries on this paper.
 *
 * Everything derives from the page height, so an A5 booklet gets an A5-sized
 * contents list rather than A4 type squeezed onto smaller paper.
 */
export function summaryMetrics(
  page: Size,
  margin: number,
  count: number,
): SummaryMetrics {
  const linePitch = Math.max(
    page.height / SUMMARY_TUNING.linesPerSheet,
    SUMMARY_TUNING.minLinePitchPt,
  );
  const fontSize = linePitch * SUMMARY_TUNING.fontRatio;
  const headRoom = linePitch * SUMMARY_TUNING.headRoomLines;
  const rows = Math.max(
    Math.floor((page.height - margin * 2 - headRoom) / linePitch),
    1,
  );
  const usableWidth = Math.max(page.width - margin * 2, 0);
  const entryGap = fontSize * SUMMARY_TUNING.entryGapEm;
  const gutter = fontSize * SUMMARY_TUNING.gutterEm;
  const columns = chooseColumns(
    count,
    rows,
    usableWidth,
    gutter,
    fontSize * SUMMARY_TUNING.minColumnEm,
  );
  return {
    linePitch,
    fontSize,
    top: margin + headRoom,
    rows,
    columns,
    columnWidth: (usableWidth - gutter * (columns - 1)) / columns,
    gutter,
    entryGap,
    perPage: rows * columns,
  };
}

/**
 * Place every entry of the contents list.
 *
 * **Reading order is column-first**: down the left column, then down the right,
 * then over the page. A numbered list is scanned by running a finger down the
 * numbers, and only a column-major fill keeps that sequence monotone — the
 * row-major alternative (1 2 / 3 4) makes the reader's eye ping-pong across the
 * gutter for every single entry, which is precisely the gutter this design just
 * widened to discourage crossing.
 *
 * **The last page balances.** Each page takes up to `rows × columns` entries and
 * then splits what it got evenly, so a book whose tail is nine entries prints
 * 5 + 4 instead of a full left column beside four lonely lines.
 */
export function layoutSummary(
  items: readonly SummaryItem[],
  page: Size,
  margin: number,
  measure: MeasureText,
  numberPlace: SummaryNumberPlace = 'after',
): SummaryLayout {
  const metrics = summaryMetrics(page, margin, items.length);
  const pages = Math.ceil(items.length / metrics.perPage);
  const placements: SummaryPlacement[] = [];
  const isBefore = numberPlace === 'before';

  /**
   * The indent every title shares in `before` mode.
   *
   * Set by the **widest number in the book**, not by each entry's own: "7." and
   * "12." are different widths, and a title that starts right after its own
   * number would leave the list's left edge stepping in and out by a digit. So
   * the narrower numbers are padded out to the widest — the whitespace after the
   * number is what buys one straight column of titles. `Math.max` is seeded so an
   * empty book gives 0 rather than -Infinity.
   */
  const numberColumn = isBefore
    ? Math.max(
        0,
        ...items.map((item) =>
          measure(numberText(item.number, numberPlace), metrics.fontSize),
        ),
      ) + metrics.entryGap
    : 0;

  for (let sheet = 0; sheet < pages; sheet++) {
    const from = sheet * metrics.perPage;
    const onSheet = Math.min(metrics.perPage, items.length - from);
    // Even split, but never taller than the page allows: on a full sheet this is
    // exactly `rows`, and on the tail sheet it is half of what is left.
    const perColumn = Math.min(
      metrics.rows,
      Math.ceil(onSheet / metrics.columns),
    );

    for (let i = 0; i < onSheet; i++) {
      const item = items[from + i];
      const column = Math.floor(i / perColumn);
      const row = i % perColumn;
      const x = margin + column * (metrics.columnWidth + metrics.gutter);
      const number = numberText(item.number, numberPlace);
      const numberWidth = measure(number, metrics.fontSize);
      // What the number does not claim is the title's. Going `after`, every entry
      // measures its OWN number, because reserving the widest would leave a
      // ragged hole in a short book; coming `before`, it is the shared indent,
      // because the titles have to line up.
      const room =
        metrics.columnWidth -
        (isBefore ? numberColumn : numberWidth + metrics.entryGap);
      const title = fitTitle(item.title, room, metrics.fontSize, measure);
      const titleX = x + (isBefore ? numberColumn : 0);
      placements.push({
        index: from + i,
        page: sheet,
        column,
        row,
        title,
        isTruncated: title !== item.title,
        number,
        titleX,
        numberX: isBefore ? x : x + metrics.columnWidth,
        numberAlign: isBefore ? 'left' : 'right',
        ...leader(
          titleX + measure(title, metrics.fontSize),
          x + metrics.columnWidth - numberWidth,
          metrics,
          measure,
          isBefore,
        ),
        y: metrics.top + row * metrics.linePitch,
      });
    }
  }

  return { metrics, pages, placements };
}

/**
 * The number as it is drawn: `7.` in front of a title, a bare `7` at the column's
 * right edge.
 *
 * The period belongs to the leading form only, and for the same reason the song's
 * own page carries one (`numberedAst`): in front of a name a number is an
 * ordinal, and "7 Wonderwall" reads as a title that begins with a digit. At the
 * far end of a row of dots it is a page reference, where a period would be a
 * speck of dirt.
 */
function numberText(number: string, place: SummaryNumberPlace): string {
  return place === 'before' ? `${number}.` : number;
}

/**
 * The dots between a title and its page number.
 *
 * Aligned to the **number**, not to the title: the column of numbers is the
 * strong vertical line on the page, and a leader that stopped a fraction of a dot
 * short of it by a different amount on every row would be the one thing on the
 * page fighting that line. So the run ends a fixed gap from the number and the
 * slack falls next to the title, where the eye is already anchored on a word.
 *
 * A run too short to read as a leader is dropped rather than printed as one or
 * two stray dots — a long title that fills its column wants clear space after it,
 * not punctuation.
 */
function leader(
  titleRight: number,
  numberLeft: number,
  metrics: SummaryMetrics,
  measure: MeasureText,
  isBefore: boolean,
): { leader: string; leaderX: number } {
  if (isBefore) return { leader: '', leaderX: 0 };

  const gap = metrics.fontSize * SUMMARY_TUNING.leaderGapEm;
  const room = numberLeft - gap - (titleRight + gap);
  const dot = measure(DOT, metrics.fontSize);
  const dots = dot > 0 ? Math.floor(room / dot) : 0;
  if (dots < SUMMARY_TUNING.minLeaderDots) return { leader: '', leaderX: 0 };
  return {
    leader: DOT.repeat(dots),
    leaderX: numberLeft - gap - dots * dot,
  };
}

/**
 * `title`, shortened with an ellipsis until it fits in `room`.
 *
 * **Truncated, not wrapped.** A contents page is a table: one entry, one line,
 * so the row a number sits on is the row its title sits on and the page count is
 * knowable before a single glyph is drawn (which the summary needs — it prints
 * page numbers that include its own length). Wrapping would make an entry's
 * height depend on its title and hand the pagination a circular problem for the
 * sake of the second half of a name nobody reads off a contents page. The whole
 * line stays a link either way, so a clipped title still navigates.
 *
 * Binary search over code points, so an emoji or a combining accent is never cut
 * in half and a long list does not cost a measurement per character.
 */
function fitTitle(
  title: string,
  room: number,
  fontSize: number,
  measure: MeasureText,
): string {
  if (room <= 0) return '';
  if (measure(title, fontSize) <= room) return title;

  const glyphs = [...title];
  const clip = (n: number): string =>
    glyphs.slice(0, n).join('').trimEnd() + ELLIPSIS;

  let fits = 0;
  let over = glyphs.length;
  while (fits < over) {
    const mid = Math.ceil((fits + over) / 2);
    if (measure(clip(mid), fontSize) <= room) fits = mid;
    else over = mid - 1;
  }
  if (fits > 0) return clip(fits);
  // Not even one character and a dot: say "there was something here" if the
  // ellipsis alone fits, and give up silently if it does not.
  return measure(ELLIPSIS, fontSize) <= room ? ELLIPSIS : '';
}
