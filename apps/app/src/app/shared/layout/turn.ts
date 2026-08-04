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
 * Re-exported rather than written here: the same question is asked of a sheet of
 * paper by the print pipeline, which sits in `shared/data-access` and cannot see
 * the app — so the rule itself lives beside the other ratio arithmetic in
 * `render-core`, and this is the name the Performance view knows it by.
 */
export { gainsRoomTurned } from '@achordeon/shared/render-core';

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
