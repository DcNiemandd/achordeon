import { createFakeMeasurer } from '@achordeon/shared/render-core';
import { MM, PAGE_SIZES } from './page-geometry';
import {
  SUMMARY_TUNING,
  layoutSummary,
  summaryMetrics,
  type MeasureText,
  type SummaryItem,
} from './summary-layout';

// The same monospace fake the renderer's geometry tests use (PRD-RENDERING §1):
// every glyph is 0.6 × the size, so a column's capacity is hand-computable and
// a truncation can be asserted to the character.
const fake = createFakeMeasurer();
const measure: MeasureText = (text, fontSize) =>
  fake.measure(text, {
    family: 'Roboto Mono',
    sizePx: fontSize,
    weight: 'normal',
  }).width;

const A4 = PAGE_SIZES.A4;
const MARGIN = 10 * MM;

const items = (
  count: number,
  title = (n: number) => `Song ${n}`,
): SummaryItem[] =>
  Array.from({ length: count }, (_, i) => ({
    title: title(i + 1),
    number: String(i + 1),
  }));

/** Rows one column holds on A4 at the default margin — the split threshold. */
const ROWS = summaryMetrics(A4, MARGIN, 0).rows;

describe('summaryMetrics', () => {
  it('breaks the columns further apart than a title from its own number', () => {
    // The whole point of the two-column summary: the gutter has to read as the
    // stronger boundary, or column one's page numbers look like a prefix of
    // column two's titles.
    const metrics = summaryMetrics(A4, MARGIN, ROWS + 1);
    expect(metrics.columns).toBe(2);
    expect(metrics.gutter).toBeGreaterThan(metrics.entryGap * 2);
    expect(metrics.gutter / metrics.entryGap).toBeCloseTo(
      SUMMARY_TUNING.gutterEm / SUMMARY_TUNING.entryGapEm,
    );
  });

  it('splits the usable width between the columns and the gutter, exactly', () => {
    const metrics = summaryMetrics(A4, MARGIN, ROWS + 1);
    expect(metrics.columnWidth * 2 + metrics.gutter).toBeCloseTo(
      A4.width - MARGIN * 2,
    );
  });

  it('keeps a short book in one column', () => {
    // A three-song list split across half a sheet reads as a broken layout, not
    // as a contents page. One column already holds it, so there is no room to buy.
    const metrics = summaryMetrics(A4, MARGIN, 3);
    expect(metrics.columns).toBe(1);
    expect(metrics.columnWidth).toBeCloseTo(A4.width - MARGIN * 2);
  });

  it('splits the moment the list outgrows a single column', () => {
    expect(summaryMetrics(A4, MARGIN, ROWS).columns).toBe(1);
    expect(summaryMetrics(A4, MARGIN, ROWS + 1).columns).toBe(2);
  });

  it('refuses the split when neither column could hold a title', () => {
    // A margin that eats the paper: two columns would be two stacks of ellipses,
    // which is a worse answer than one narrow column.
    const narrow = { width: 200, height: A4.height };
    expect(summaryMetrics(narrow, 80, 500).columns).toBe(1);
  });

  it('sizes the type off the page, so A5 gets an A5 contents list', () => {
    const a5 = summaryMetrics(PAGE_SIZES.A5, MARGIN, 100);
    const a4 = summaryMetrics(A4, MARGIN, 100);
    expect(a5.fontSize).toBeLessThan(a4.fontSize);
    expect(a5.columns).toBe(2);
  });
});

describe('layoutSummary', () => {
  it('has no pages at all for a book with nothing in it', () => {
    // Not one blank sheet: the page numbering counts front matter, and a summary
    // that lists nothing would push every song's number off by one.
    const layout = layoutSummary([], A4, MARGIN, measure);
    expect(layout.pages).toBe(0);
    expect(layout.placements).toEqual([]);
  });

  it('runs down the left column before starting the right', () => {
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    const perColumn = Math.ceil((ROWS + 1) / 2);
    const columns = layout.placements.map((p) => p.column);
    expect(columns.slice(0, perColumn)).toEqual(new Array(perColumn).fill(0));
    expect(new Set(columns.slice(perColumn))).toEqual(new Set([1]));
    // …and the rows descend within each column, so a finger tracing the numbers
    // never crosses the gutter twice.
    expect(layout.placements.slice(0, perColumn).map((p) => p.row)).toEqual(
      Array.from({ length: perColumn }, (_, i) => i),
    );
  });

  it('balances the columns instead of filling the left one to the brim', () => {
    // The trigger case: one entry more than a column holds. 18 + 17, never 35 + 1.
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    const left = layout.placements.filter((p) => p.column === 0).length;
    const right = layout.placements.filter((p) => p.column === 1).length;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(left + right).toBe(ROWS + 1);
  });

  it('puts the second column a whole gutter past the first', () => {
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    const { metrics } = layout;
    const [left] = layout.placements.filter((p) => p.column === 0);
    const [right] = layout.placements.filter((p) => p.column === 1);
    expect(left.titleX).toBeCloseTo(MARGIN);
    expect(right.titleX).toBeCloseTo(
      MARGIN + metrics.columnWidth + metrics.gutter,
    );
    // The first column's numbers stop a full gutter short of the next title.
    const columnBreak = right.titleX - left.numberX;
    expect(columnBreak).toBeCloseTo(metrics.gutter);
    // …and that break is wider than the one inside an entry.
    expect(columnBreak).toBeGreaterThan(metrics.entryGap);
  });

  it('aligns every number on the column edge and every title on its left', () => {
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    for (const placed of layout.placements) {
      expect(placed.numberX - placed.titleX).toBeCloseTo(
        layout.metrics.columnWidth,
      );
    }
    const lefts = new Set(layout.placements.map((p) => Math.round(p.titleX)));
    expect(lefts.size).toBe(2);
  });

  it('pages once both columns are full, and balances the tail sheet', () => {
    const metrics = summaryMetrics(A4, MARGIN, 1000);
    const count = metrics.perPage + 9;
    const layout = layoutSummary(items(count), A4, MARGIN, measure);
    expect(layout.pages).toBe(2);

    const first = layout.placements.filter((p) => p.page === 0);
    expect(first).toHaveLength(metrics.perPage);
    // Reading order survives the page break: the last entry of page one is the
    // one before the first entry of page two.
    const second = layout.placements.filter((p) => p.page === 1);
    expect(second[0].index).toBe(metrics.perPage);
    expect(second).toHaveLength(9);
    expect(second.filter((p) => p.column === 0)).toHaveLength(5);
    expect(second.filter((p) => p.column === 1)).toHaveLength(4);
    // Every page starts its columns at the same baseline.
    expect(second[0].y).toBeCloseTo(first[0].y);
  });

  it('stacks the rows one line pitch apart, from the head room down', () => {
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    const { metrics } = layout;
    expect(layout.placements[0].y).toBeCloseTo(
      MARGIN + metrics.linePitch * SUMMARY_TUNING.headRoomLines,
    );
    expect(layout.placements[1].y - layout.placements[0].y).toBeCloseTo(
      metrics.linePitch,
    );
    // Nothing runs past the bottom margin.
    const last = Math.max(...layout.placements.map((p) => p.y));
    expect(last).toBeLessThanOrEqual(A4.height - MARGIN);
  });

  it('truncates a title that would reach into the next column', () => {
    const long = 'A title so long it would run clean across the gutter'.repeat(
      3,
    );
    const layout = layoutSummary(
      [{ title: long, number: '99' }, ...items(ROWS)],
      A4,
      MARGIN,
      measure,
    );
    const [placed] = layout.placements;
    const { metrics } = layout;
    const room =
      metrics.columnWidth - measure('99', metrics.fontSize) - metrics.entryGap;
    expect(placed.isTruncated).toBe(true);
    expect(placed.title.endsWith('…')).toBe(true);
    expect(measure(placed.title, metrics.fontSize)).toBeLessThanOrEqual(room);
    // Truncation is the *last* resort — it clips as late as it can, so one more
    // character would have overflowed.
    const kept = placed.title.length - 1;
    const oneMore = `${long.slice(0, kept + 1)}…`;
    expect(measure(oneMore, metrics.fontSize)).toBeGreaterThan(room);
  });

  it('leaves a title that fits exactly as it was written', () => {
    const layout = layoutSummary(items(ROWS + 1), A4, MARGIN, measure);
    expect(layout.placements.every((p) => p.isTruncated)).toBe(false);
    expect(layout.placements[0].title).toBe('Song 1');
    expect(layout.placements[0].number).toBe('1');
  });

  it('gives a wide number less title room than a narrow one', () => {
    // Every entry measures its own number, so a book that reaches three digits
    // does not make its first nine entries pay for the width.
    const wide = layoutSummary(
      [{ title: 'x'.repeat(200), number: '1000' }],
      A4,
      MARGIN,
      measure,
    ).placements[0];
    const narrow = layoutSummary(
      [{ title: 'x'.repeat(200), number: '1' }],
      A4,
      MARGIN,
      measure,
    ).placements[0];
    expect(wide.title.length).toBeLessThan(narrow.title.length);
  });

  it('never returns a title it could not fit at all', () => {
    // A page so tight the column has no room left: better an empty cell than
    // text drawn over the next column.
    const layout = layoutSummary(
      items(500),
      { width: 60, height: A4.height },
      20,
      measure,
    );
    for (const placed of layout.placements) {
      expect(
        measure(placed.title, layout.metrics.fontSize),
      ).toBeLessThanOrEqual(Math.max(layout.metrics.columnWidth, 0));
    }
  });
});
