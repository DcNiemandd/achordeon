import { A4_RATIO, parseAspectRatio } from './aspect';

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
