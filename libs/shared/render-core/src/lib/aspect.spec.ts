import {
  A4_RATIO,
  formatAspectRatio,
  gainsRoomTurned,
  parseAspectRatio,
  tryParseAspectRatio,
} from './aspect';

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

  // Total, like everything else in this file: a half-built layout must not be
  // able to turn a page by accident.
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

  it('agrees with the fit it is predicting', () => {
    // The claim the whole feature rests on: "gains room" means the turned fit is
    // genuinely wider than the upright one, under the same
    // min(boxW, boxH × ratio) both the CSS and zoom.ts use.
    const fit = (boxW: number, boxH: number, ratio: number) =>
      Math.min(boxW, boxH * ratio);
    for (const [boxW, boxH] of [
      [400, 900],
      [900, 400],
      [500, 500],
    ]) {
      for (const ratio of [A4, A4_WIDE, PHONE, PHONE_WIDE, 1]) {
        const upright = fit(boxW, boxH, ratio);
        const turned = fit(boxH, boxW, ratio);
        expect(gainsRoomTurned(ratio, boxW / boxH)).toBe(turned > upright);
      }
    }
  });
});

describe('parseAspectRatio', () => {
  it('maps the A4 preset to portrait width÷height', () => {
    expect(parseAspectRatio('A4')).toBeCloseTo(210 / 297);
    expect(parseAspectRatio('A4')).toBe(A4_RATIO);
  });

  it('passes a positive number through as the ratio', () => {
    expect(parseAspectRatio(1.5)).toBe(1.5);
  });

  it('parses w:h and w/h strings', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9);
    expect(parseAspectRatio('4/3')).toBeCloseTo(4 / 3);
    expect(parseAspectRatio('2.5:1')).toBeCloseTo(2.5);
  });

  it('parses a bare number given as text', () => {
    // Every value from the settings GUI is a string — an <input> and an <option>
    // hold nothing else. Parsing "3:4" but not "0.75" made a typed ratio
    // silently render as A4 (CONTEXT.md: the input accepts "N (float)").
    expect(parseAspectRatio('1' as never)).toBeCloseTo(1);
    expect(parseAspectRatio('0.75' as never)).toBeCloseTo(0.75);
  });

  it('falls back to A4 on non-positive or malformed input', () => {
    expect(parseAspectRatio(0)).toBe(A4_RATIO);
    expect(parseAspectRatio(-3)).toBe(A4_RATIO);
    expect(parseAspectRatio('0:5')).toBe(A4_RATIO);
    expect(parseAspectRatio('nonsense' as never)).toBe(A4_RATIO);
    expect(parseAspectRatio('0' as never)).toBe(A4_RATIO);
    expect(parseAspectRatio('-2' as never)).toBe(A4_RATIO);
    expect(parseAspectRatio('' as never)).toBe(A4_RATIO);
  });
});

describe('formatAspectRatio', () => {
  it('reduces a pixel box to its smallest whole ratio', () => {
    // Real screens: iPhone 15, iPad Air 11", iPad Pro 13".
    expect(formatAspectRatio(393, 852)).toBe('131:284');
    expect(formatAspectRatio(820, 1180)).toBe('41:59');
    expect(formatAspectRatio(1024, 1366)).toBe('512:683');
  });

  it('leaves an already-irreducible box alone', () => {
    expect(formatAspectRatio(412, 915)).toBe('412:915');
  });

  it('keeps the orientation it was given', () => {
    expect(formatAspectRatio(852, 393)).toBe('284:131');
  });

  it('emits non-integers as given rather than guessing a whole ratio', () => {
    // A GCD cannot reduce these, and rounding them would report a shape the
    // caller did not measure.
    expect(formatAspectRatio(1.5, 2)).toBe('1.5:2');
  });

  it('has no answer for a box that is not positive and finite', () => {
    expect(formatAspectRatio(0, 100)).toBeNull();
    expect(formatAspectRatio(100, 0)).toBeNull();
    expect(formatAspectRatio(-3, 4)).toBeNull();
    expect(formatAspectRatio(Number.NaN, 4)).toBeNull();
    expect(formatAspectRatio(Number.POSITIVE_INFINITY, 4)).toBeNull();
  });

  it('round-trips through the reader it is the inverse of', () => {
    // The property that matters: what the picker stores means, to the renderer,
    // exactly the shape that was measured.
    for (const [w, h] of [
      [393, 852],
      [412, 915],
      [1024, 1366],
      [360, 780],
      [440, 956],
    ]) {
      const formatted = formatAspectRatio(w, h);
      expect(formatted).not.toBeNull();
      expect(tryParseAspectRatio(formatted as never)).toBeCloseTo(w / h);
    }
  });
});
