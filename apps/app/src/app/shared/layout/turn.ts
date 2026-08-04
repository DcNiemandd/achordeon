// Turning the page — the arithmetic
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md; CONTEXT.md §Turn the page
//
// Pure, for the reason `zoom.ts` is pure: the hard parts are two sums — is a
// quarter turn worth anything here, and which way is "right" once the page has
// taken one — and everything else is a listener or a stylesheet. ADR-0013 says
// rotation is derived and never stored, so this file is the whole of the
// derivation and every caller asks it rather than deciding for itself.

import type { Desk } from './zoom';

/**
 * Would turning the page a quarter gain it room?
 *
 * **The one predicate.** Every rotation in the app — the reader's on a phone, the
 * automatic one on paper, and later a slot's own — is this question asked of a
 * different box. Two settings that could disagree about when a page is sideways
 * would be exactly the second opinion ADR-0013 exists to prevent.
 *
 * The page is fitted at `min(boxW, boxH × ratio)` (`.page` in `blank-page.ts`,
 * and `contain` in `zoom.ts`); turned, it is fitted against the same box with the
 * dimensions swapped. Working that through, the turned fit is wider exactly when
 * the two ratios sit on **opposite sides of 1** — a landscape page in a portrait
 * box, or a portrait page in a landscape one. Same-handed pairs never gain, and a
 * square on either side is a tie, which is a no: a rotation that buys nothing is
 * a rotation that only costs the reader their bearings.
 *
 * Anything unmeasurable is a no, on the same grounds as `zoom.ts`'s `isMeasured`:
 * a gesture or a render can arrive before layout has settled, and a page that
 * silently turned because a ratio was briefly `NaN` is a bug nobody can reproduce.
 */
export function gainsRoomTurned(pageRatio: number, boxRatio: number): boolean {
  if (!Number.isFinite(pageRatio) || !Number.isFinite(boxRatio)) {
    return false;
  }
  if (pageRatio <= 0 || boxRatio <= 0) {
    return false;
  }
  return (pageRatio - 1) * (boxRatio - 1) < 0;
}

/** A delta, in whichever frame the function that returned it says. */
export interface Delta {
  readonly dx: number;
  readonly dy: number;
}

/**
 * A movement the reader made, said in the page's own frame.
 *
 * The page is drawn under `rotate(-90deg)`, which sends a page-space `(x, y)` to
 * a screen-space `(y, -x)` — so the page's rightward runs **up** the screen. This
 * is that map read backwards, and it is the only place the quarter turn touches
 * an input: a finger travels in screen px, and everything downstream of it (the
 * pan clamps in `zoom.ts`, Stage's swipe threshold) reasons in the page's frame.
 *
 * **Both callers or neither.** Map the pan and not the swipe and a turned
 * performer drags the page one way while the page-turn watches the other — which
 * is not a wrong answer so much as two answers, and the reader has to discover
 * both. See ADR-0013 §Consequences.
 */
export function toPageDelta(dx: number, dy: number): Delta {
  return { dx: tidyZero(-dy), dy: tidyZero(dx) };
}

/** Negating zero yields `-0`, which is the same number and a different value to
 * every equality in the language — and eventually a `translate(-0px, …)`. The
 * same tidy-up `zoom.ts` does for the same reason. */
function tidyZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * The desk as the turned page meets it: the same hole, measured the other way
 * round.
 *
 * This is what keeps `zoom.ts` from ever hearing about rotation. Its fit and its
 * clamps are written against a `Desk`, and a page turned a quarter is fitted to
 * exactly the desk it would have had if the desk itself were transposed — so the
 * frame change is spent here, once, and the arithmetic downstream is the same
 * arithmetic with the same tests. `ratio` is the *page's*, so it does not move.
 */
export function turnedDesk(desk: Desk): Desk {
  return { width: desk.height, height: desk.width, ratio: desk.ratio };
}
