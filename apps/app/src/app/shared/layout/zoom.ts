// Page zoom — the arithmetic
// Spec: docs/adr/0012-page-zoom-is-ours-not-the-browsers.md; CONTEXT.md §Zoom
//
// Pure, and deliberately so: every hard part of a zoom is a sum (does the page
// still cover the desk? which point stays under the finger?), and every easy part
// is an event listener. Splitting them means the sums are tested without a DOM
// and the listener stays a translation layer. `PageZoom` is the listener.

/** How far in the page may go. Past this a chord glyph is a wall, not a chord. */
const MAX_SCALE = 5;
/** Fit. There is nothing below it — the page already fills the desk. */
const MIN_SCALE = 1;
/** Where a double-tap lands from fit. Big enough to read, small enough to keep
 * a verse's width on screen. */
const DOUBLE_TAP_SCALE = 2.5;
/**
 * Within this much of fit, snap to it exactly.
 *
 * A pinch never ends on a round number, and a page left at 1.004 keeps the pan
 * clamps alive, holds the page a sub-pixel off-centre and — worst — leaves
 * `isZoomed` true, so the swipe stays disabled on a page that looks unzoomed.
 * Somebody pinching back to "off" means off.
 */
const SNAP_EPSILON = 0.02;

/** The page, magnified and moved. `x`/`y` are CSS px of the page's centre away
 * from the desk's centre — the numbers `BlankPage` puts in its `translate()`. */
export interface ZoomState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The hole the page is looked at through, and the shape of the page in it.
 *
 * `ratio` is width ÷ height, the same number `BlankPage.ratio` takes, because the
 * page's size is *derived* here rather than measured: `min(deskW, deskH × ratio)`
 * is `.page`'s own `min(100cqi, 100cqb × var(--page-ratio))` written in
 * TypeScript. Measuring it instead would mean reaching through a component's
 * encapsulation for a number that is already knowable, and reading back a layout
 * we are in the middle of changing.
 */
export interface Desk {
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

/** A point to zoom about, in CSS px from the desk's centre. */
export interface Focus {
  readonly x: number;
  readonly y: number;
}

/** The whole page, centred, unmagnified. */
export const FIT: ZoomState = { scale: MIN_SCALE, x: 0, y: 0 };

/** What the keyboard zooms about: nothing is under a key. */
export const CENTRE: Focus = { x: 0, y: 0 };

export function isZoomed(state: ZoomState): boolean {
  return state.scale > MIN_SCALE;
}

/** The magnification as a whole percent, for the pill. */
export function zoomPercent(state: ZoomState): number {
  return Math.round(state.scale * 100);
}

/**
 * Scale about a point, keeping whatever is under that point under it.
 *
 * The page-local point beneath the focus is `(focus − x) / scale`; asking for it
 * to still be at `focus` after the scale changes rearranges to the two lines
 * below. This is what makes a pinch feel attached to the fingers rather than to
 * the middle of the screen, and it is the same sum a double-tap uses to zoom
 * *into the verse you tapped* instead of into the centre of the page.
 */
export function zoomTo(
  state: ZoomState,
  desk: Desk,
  scale: number,
  focus: Focus,
): ZoomState {
  if (!isMeasured(desk)) return state;
  const next = clampTo(scale, MIN_SCALE, MAX_SCALE);
  const factor = next / state.scale;
  return contain(
    {
      scale: next,
      x: focus.x - (focus.x - state.x) * factor,
      y: focus.y - (focus.y - state.y) * factor,
    },
    desk,
  );
}

/** Scale by a factor — a wheel notch, a pinch frame, a key press. */
export function zoomBy(
  state: ZoomState,
  desk: Desk,
  factor: number,
  focus: Focus,
): ZoomState {
  return zoomTo(state, desk, state.scale * factor, focus);
}

/** Drag the page under the desk. Clamped, so an edge is as far as it goes. */
export function panBy(
  state: ZoomState,
  desk: Desk,
  dx: number,
  dy: number,
): ZoomState {
  if (!isMeasured(desk)) return state;
  return contain({ ...state, x: state.x + dx, y: state.y + dy }, desk);
}

/**
 * The double-tap: in from fit, all the way back out from anywhere else.
 *
 * Toggling rather than only resetting is what every gallery does, and it is why
 * the gesture is worth having at all — on a phone it is the whole feature, with
 * pinch as the fine adjustment.
 */
export function toggleZoom(
  state: ZoomState,
  desk: Desk,
  focus: Focus,
): ZoomState {
  if (!isMeasured(desk)) return state;
  return isZoomed(state) ? FIT : zoomTo(FIT, desk, DOUBLE_TAP_SCALE, focus);
}

/**
 * Clamp a state into something that can actually be looked at: scale in range,
 * and never a strip of bare desk beside a page big enough to cover it. An axis
 * the scaled page does not fill is pinned to centred rather than left loose —
 * a page smaller than its hole has one correct position, not a range.
 */
function contain(state: ZoomState, desk: Desk): ZoomState {
  const scale = clampTo(state.scale, MIN_SCALE, MAX_SCALE);
  if (scale <= MIN_SCALE + SNAP_EPSILON) return FIT;

  const width = Math.min(desk.width, desk.height * desk.ratio);
  const height = width / desk.ratio;
  const maxX = Math.max(0, (width * scale - desk.width) / 2);
  const maxY = Math.max(0, (height * scale - desk.height) / 2);

  return {
    scale,
    x: tidyZero(clampTo(state.x, -maxX, maxX)),
    y: tidyZero(clampTo(state.y, -maxY, maxY)),
  };
}

/** Clamping into a zero-width range yields `-0`, which is centred and prints as
 * `translate(-0px, …)`. Same number, tidier transform. */
function tidyZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Is there a desk to do arithmetic against yet?
 *
 * A gesture can arrive before layout has settled (or in a test host with no
 * layout at all), and a zero-width desk turns every clamp into `NaN`, which then
 * sticks — a `NaN` transform is dropped by CSS, so the page would silently stop
 * responding for the rest of the performance. Every entry point refuses instead.
 */
function isMeasured(desk: Desk): boolean {
  return (
    Number.isFinite(desk.width) &&
    Number.isFinite(desk.height) &&
    Number.isFinite(desk.ratio) &&
    desk.width > 0 &&
    desk.height > 0 &&
    desk.ratio > 0
  );
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
