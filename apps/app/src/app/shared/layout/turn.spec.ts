// Turning the page — the arithmetic
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md

import type { Desk } from './zoom';
import { toPageDelta, turnedDesk } from './turn';

// The predicate itself is `render-core`'s (both this frame and the print
// pipeline ask it), and is tested beside the rest of the ratio arithmetic in
// `aspect.spec.ts`. What is the app's — and tested here — is the frame change.
const A4_WIDE = 297 / 210;

describe('toPageDelta', () => {
  // rotate(-90deg) sends a page-space (x, y) to a screen-space (y, -x), so the
  // page's rightward runs UP the screen. These are that map read backwards.
  it('reads a swipe up the screen as a move right across the page', () => {
    expect(toPageDelta(0, -10)).toEqual({ dx: 10, dy: 0 });
  });

  it('reads a swipe down the screen as a move left across the page', () => {
    expect(toPageDelta(0, 10)).toEqual({ dx: -10, dy: 0 });
  });

  it('reads a swipe right across the screen as a move down the page', () => {
    expect(toPageDelta(10, 0)).toEqual({ dx: 0, dy: 10 });
  });

  it('keeps a diagonal a diagonal', () => {
    expect(toPageDelta(3, 4)).toEqual({ dx: -4, dy: 3 });
  });

  it('leaves a standstill alone', () => {
    expect(toPageDelta(0, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it('preserves length — a quarter turn is not a scale', () => {
    const { dx, dy } = toPageDelta(3, 4);
    expect(Math.hypot(dx, dy)).toBeCloseTo(5);
  });

  it('comes back to where it started after four turns', () => {
    const once = toPageDelta(7, -2);
    const twice = toPageDelta(once.dx, once.dy);
    const thrice = toPageDelta(twice.dx, twice.dy);
    expect(toPageDelta(thrice.dx, thrice.dy)).toEqual({ dx: 7, dy: -2 });
  });
});

describe('turnedDesk', () => {
  const DESK: Desk = { width: 400, height: 900, ratio: A4_WIDE };

  it('swaps the hole and leaves the page shape alone', () => {
    expect(turnedDesk(DESK)).toEqual({
      width: 900,
      height: 400,
      ratio: A4_WIDE,
    });
  });

  it('is its own inverse', () => {
    expect(turnedDesk(turnedDesk(DESK))).toEqual(DESK);
  });

  // The point of the transposition: zoom.ts fits at min(width, height × ratio),
  // and a landscape page in a portrait desk should end up fitted to the desk's
  // LONG side once it has turned.
  it('makes the fit take the desk long side', () => {
    const upright = Math.min(DESK.width, DESK.height * DESK.ratio);
    const turned = turnedDesk(DESK);
    expect(
      Math.min(turned.width, turned.height * turned.ratio),
    ).toBeGreaterThan(upright);
  });
});
