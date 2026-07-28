// Song explorer ▸ window end — Epic 5 (correction)
// Spec: PRD-INFRASTRUCTURE.md §3 (growing windowed cache), CONTEXT.md §Song explorer

/** Fetch the next page this many rows before the window's end, so the list has
 * already grown by the time the user reaches the bottom. */
export const PREFETCH_ROWS = 10;

/**
 * Is the end of the loaded window close enough to the screen that the next page
 * should already be on its way?
 *
 * **Measured from the last row the user can see, not the first.** The CDK's
 * `scrolledIndexChange` reports the *first visible* index, and the check used to
 * compare that number alone against the window's length — which quietly capped
 * the list at one page on every screen tall enough to matter. A viewport can only
 * ever scroll its first index to `total - visibleRows`, so with a 50-row page and
 * a 15-row-tall list the index tops out at 35: ten rows short of the 40 the old
 * test demanded, at the very bottom of the list, with nowhere left to scroll. The
 * threshold was unreachable, so the "infinite" list simply ended. The taller the
 * pane, the further out of reach it moved — which is why the full-height Songs
 * module never grew past its first page while a short one sometimes did.
 *
 * Adding the visible rows back on is what makes the question the one we meant to
 * ask: *how many loaded rows are still below the fold*, not *how far down has the
 * top of the screen travelled*.
 */
export function isNearWindowEnd(
  firstVisibleIndex: number,
  visibleRows: number,
  total: number,
): boolean {
  return firstVisibleIndex + visibleRows + PREFETCH_ROWS >= total;
}
