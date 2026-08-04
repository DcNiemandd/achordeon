// Turning the page — the arithmetic
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md

import type { Desk } from './zoom';
import { gainsRoomTurned, toPageDelta, turnedDesk } from './turn';

/** A4 portrait, and the same sheet the other way round. */
const A4 = 210 / 297;
const A4_WIDE = 297 / 210;
/** A phone panel, and a wide song written to fill one held sideways. */
const PHONE = 131 / 284;
const PHONE_WIDE = 284 / 131;

describe('gainsRoomTurned', () => {
  it('turns a landscape page in a portrait box', () => {
    expect(gainsRoomTurned(PHONE_WIDE, PHONE)).toBe(true);
    expect(gainsRoomTurned(A4_WIDE, A4)).toBe(true);
  });

  it('turns a portrait page in a landscape box', () => {
    expect(gainsRoomTurned(A4, A4_WIDE)).toBe(true);
    expect(gainsRoomTurned(PHONE, 16 / 9)).toBe(true);
  });

  it('leaves a page whose box is handed the same way alone', () => {
    expect(gainsRoomTurned(A4, PHONE)).toBe(false);
    expect(gainsRoomTurned(A4_WIDE, 16 / 9)).toBe(false);
  });

  // A tie is a no: a quarter turn that buys nothing costs the reader their
  // bearings for free.
  it('calls a square a tie on either side', () => {
    expect(gainsRoomTurned(1, A4)).toBe(false);
    expect(gainsRoomTurned(A4_WIDE, 1)).toBe(false);
    expect(gainsRoomTurned(1, 1)).toBe(false);
  });

  // Same refusal as zoom.ts's isMeasured, and for the same reason: a render or a
  // gesture can arrive before layout has settled.
  it('refuses anything it cannot measure', () => {
    expect(gainsRoomTurned(Number.NaN, A4)).toBe(false);
    expect(gainsRoomTurned(A4_WIDE, Number.NaN)).toBe(false);
    expect(gainsRoomTurned(Number.POSITIVE_INFINITY, A4)).toBe(false);
    expect(gainsRoomTurned(0, A4)).toBe(false);
    expect(gainsRoomTurned(A4_WIDE, 0)).toBe(false);
    expect(gainsRoomTurned(-A4_WIDE, A4)).toBe(false);
  });

  it('is symmetric — the question does not care which ratio is the page', () => {
    expect(gainsRoomTurned(A4, A4_WIDE)).toBe(gainsRoomTurned(A4_WIDE, A4));
  });
});

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
