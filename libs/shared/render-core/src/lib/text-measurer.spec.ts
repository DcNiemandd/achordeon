import {
  fontShorthand,
  normalizeMetrics,
  type FontSpec,
} from './text-measurer';
import { createFakeMeasurer } from './fake-measurer';

describe('normalizeMetrics', () => {
  it('passes through a usable font box', () => {
    const m = normalizeMetrics(
      { width: 40, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 },
      16,
      1.2,
    );
    expect(m).toEqual({
      width: 40,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
    });
  });

  it('synthesises a box when ascent/descent are missing', () => {
    const m = normalizeMetrics({ width: 40 }, 16, 1.2);
    // total = 16 * 1.2 = 19.2, split 80/20
    expect(m.fontBoundingBoxAscent).toBeCloseTo(15.36);
    expect(m.fontBoundingBoxDescent).toBeCloseTo(3.84);
    expect(m.width).toBe(40);
  });

  it('synthesises a box when ascent+descent are zero', () => {
    const m = normalizeMetrics(
      { width: 10, fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 },
      10,
      1.0,
    );
    expect(m.fontBoundingBoxAscent + m.fontBoundingBoxDescent).toBeCloseTo(10);
  });
});

describe('fontShorthand', () => {
  it('builds a canvas font shorthand', () => {
    const f: FontSpec = { family: 'Foo', sizePx: 18, weight: 'bold' };
    expect(fontShorthand(f)).toBe('bold 18px Foo');
  });

  it('includes an italic style when set', () => {
    const f: FontSpec = {
      family: 'Foo',
      sizePx: 18,
      weight: 'normal',
      style: 'italic',
    };
    expect(fontShorthand(f)).toBe('italic normal 18px Foo');
  });
});

describe('createFakeMeasurer', () => {
  it('measures width linearly in character count', () => {
    const measure = createFakeMeasurer();
    const font: FontSpec = { family: 'x', sizePx: 10, weight: 'normal' };
    expect(measure.measure('abc', font).width).toBeCloseTo(18); // 3 * 10 * 0.6
    expect(measure.measure('', font).width).toBe(0);
  });

  it('scales the font box with size', () => {
    const measure = createFakeMeasurer();
    const m = measure.measure('x', { family: 'x', sizePx: 20, weight: 'normal' });
    expect(m.fontBoundingBoxAscent).toBeCloseTo(16);
    expect(m.fontBoundingBoxDescent).toBeCloseTo(4);
  });
});
