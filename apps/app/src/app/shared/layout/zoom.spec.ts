// Page zoom — the arithmetic
// Spec: docs/adr/0012-page-zoom-is-ours-not-the-browsers.md

import {
  CENTRE,
  FIT,
  type Desk,
  isZoomed,
  panBy,
  toggleZoom,
  zoomBy,
  zoomPercent,
  zoomTo,
} from './zoom';

/** A square desk with a square page: the page fills it exactly at fit. */
const SQUARE: Desk = { width: 400, height: 400, ratio: 1 };

/** A wide desk with a tall page: fits by height, bare desk down both sides. */
const LETTERBOX: Desk = { width: 1000, height: 500, ratio: 0.5 };

describe('zoom', () => {
  it('starts fitted, and fitted is not zoomed', () => {
    expect(FIT).toEqual({ scale: 1, x: 0, y: 0 });
    expect(isZoomed(FIT)).toBe(false);
    expect(isZoomed({ scale: 2, x: 0, y: 0 })).toBe(true);
  });

  it('never zooms out past fit — the page already fills the desk', () => {
    expect(zoomTo(FIT, SQUARE, 0.3, CENTRE)).toEqual(FIT);
  });

  it('stops magnifying somewhere short of a wall of one chord', () => {
    expect(zoomTo(FIT, SQUARE, 99, CENTRE).scale).toBe(5);
  });

  // The whole reason a pinch feels attached to the fingers.
  it('keeps the point you zoomed about under your finger', () => {
    const focus = { x: 100, y: 0 };
    const zoomed = zoomTo(FIT, SQUARE, 2, focus);

    // What sat at page-local 100 must still land on the focus: the page centre
    // moves to -100, and -100 + 100 x 2 = 100.
    expect(zoomed.x).toBeCloseTo(-100);
    expect(zoomed.x + 100 * zoomed.scale).toBeCloseTo(focus.x);
  });

  it('snaps back to exactly fit rather than leaving a page at 1.004', () => {
    // A pinch never ends on a round number, and 1.004 would keep the swipe
    // disabled on a page that looks unzoomed.
    expect(zoomTo({ scale: 2, x: 50, y: 50 }, SQUARE, 1.01, CENTRE)).toEqual(
      FIT,
    );
  });

  it('scales by a factor, not only to an absolute', () => {
    expect(zoomBy({ scale: 2, x: 0, y: 0 }, SQUARE, 1.5, CENTRE).scale).toBe(3);
  });

  it('will not drag bare desk into view beside a page big enough to cover it', () => {
    const zoomed = zoomTo(FIT, SQUARE, 2, CENTRE);

    // At 2x the 400px page is 800px in an 400px desk: 200px of slack each way.
    expect(panBy(zoomed, SQUARE, 500, 0).x).toBe(200);
    expect(panBy(zoomed, SQUARE, -500, 0).x).toBe(-200);
  });

  it('pins an axis the page still does not fill, rather than leaving it loose', () => {
    // The letterbox page is 250 x 500 at fit; at 2x it is 500 x 1000, still
    // narrower than the 1000px desk. Horizontally there is one right answer.
    const zoomed = zoomTo(FIT, LETTERBOX, 2, { x: 300, y: 0 });

    expect(zoomed.x).toBe(0);
    expect(panBy(zoomed, LETTERBOX, 400, 0).x).toBe(0);
    expect(panBy(zoomed, LETTERBOX, 0, 400).y).toBe(250);
  });

  it('cannot be panned while it is fitted', () => {
    expect(panBy(FIT, SQUARE, 120, 80)).toEqual(FIT);
  });

  it('toggles: in from fit, all the way out from anywhere else', () => {
    const inFrom = toggleZoom(FIT, SQUARE, CENTRE);
    expect(inFrom.scale).toBe(2.5);

    expect(toggleZoom(inFrom, SQUARE, { x: 50, y: 50 })).toEqual(FIT);
  });

  it('double-taps into the verse you tapped, not into the middle of the page', () => {
    const zoomed = toggleZoom(FIT, SQUARE, { x: 120, y: -60 });

    expect(zoomed.x).toBeCloseTo(-180); // 120 - 120 x 2.5
    expect(zoomed.y).toBeCloseTo(90);
  });

  // A gesture can land before layout has settled, and a NaN transform is dropped
  // by CSS — the page would silently stop responding for the rest of the set.
  it('refuses to do arithmetic against a desk that has not been measured', () => {
    const unmeasured: Desk = { width: 0, height: 0, ratio: 0 };
    const state = { scale: 2, x: 10, y: 10 };

    expect(zoomTo(state, unmeasured, 3, CENTRE)).toEqual(state);
    expect(panBy(state, unmeasured, 5, 5)).toEqual(state);
    expect(toggleZoom(state, unmeasured, CENTRE)).toEqual(state);
  });

  it('reports whole percents for the pill', () => {
    expect(zoomPercent(FIT)).toBe(100);
    expect(zoomPercent({ scale: 2.437, x: 0, y: 0 })).toBe(244);
  });
});
