import { PREFETCH_ROWS, isNearWindowEnd } from './window-end';

/** One page of the growing window (`PAGE_LIMIT` in the data-access layer). */
const PAGE = 50;

describe('isNearWindowEnd', () => {
  /**
   * The bug that made the infinite list finite.
   *
   * A viewport can only scroll its first visible index to `total - visibleRows`,
   * so a 15-row-tall pane over a 50-row window tops out at 35 — the user is
   * physically at the bottom, with nowhere left to scroll. Comparing that index
   * alone against the window's length (the old check) demanded 40 and so never
   * fired: the taller the pane, the further out of reach the threshold moved.
   */
  it('asks for the next page when a tall pane has scrolled to the bottom', () => {
    expect(isNearWindowEnd(35, 15, PAGE)).toBe(true);
    // The old, index-only reading of the same moment — kept here as the thing
    // that must never come back.
    expect(35 + PREFETCH_ROWS >= PAGE).toBe(false);
  });

  it('asks a screenful early rather than at the last row', () => {
    // Fifteen visible rows and ten of prefetch: the fetch starts once the window
    // has 25 rows or fewer left below the top of the screen.
    expect(isNearWindowEnd(24, 15, PAGE)).toBe(false);
    expect(isNearWindowEnd(25, 15, PAGE)).toBe(true);
  });

  it('stays quiet at the top of a full page', () => {
    expect(isNearWindowEnd(0, 15, PAGE)).toBe(false);
  });

  /** A pane taller than everything loaded has no scroll left to offer, so the
   * first (and only) report it makes has to be the one that grows the window. */
  it('asks immediately when the whole window fits on the screen', () => {
    expect(isNearWindowEnd(0, 40, 30)).toBe(true);
  });

  /** Before the first measurement the viewport reports no size at all; on a
   * window shorter than the prefetch that is still an honest "ask". */
  it('falls back to the index alone when the pane has not been measured', () => {
    expect(isNearWindowEnd(0, 0, PAGE)).toBe(false);
    expect(isNearWindowEnd(0, 0, PREFETCH_ROWS)).toBe(true);
  });
});
