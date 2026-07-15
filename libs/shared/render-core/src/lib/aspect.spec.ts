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

  it('falls back to A4 on non-positive or malformed input', () => {
    expect(parseAspectRatio(0)).toBe(A4_RATIO);
    expect(parseAspectRatio(-3)).toBe(A4_RATIO);
    expect(parseAspectRatio('0:5')).toBe(A4_RATIO);
    expect(parseAspectRatio('nonsense' as never)).toBe(A4_RATIO);
  });
});
