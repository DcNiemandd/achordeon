import { MM, PAGE_SIZES, fitInto, orient, pageForBox } from './page-geometry';

describe('pageForBox', () => {
  it('prints an A4-shaped song as exactly A4', () => {
    const page = pageForBox({ width: 210, height: 297 });
    expect(page.width).toBeCloseTo(PAGE_SIZES.A4.width, 1);
    expect(page.height).toBeCloseTo(PAGE_SIZES.A4.height, 1);
  });

  it('keeps a landscape song landscape, pinning the SHORT side', () => {
    const page = pageForBox({ width: 400, height: 200 });
    expect(page.height).toBeCloseTo(PAGE_SIZES.A4.width, 1);
    expect(page.width / page.height).toBeCloseTo(2);
  });

  it('falls back to A4 for a box with nothing in it', () => {
    expect(pageForBox({ width: 0, height: 0 })).toEqual(PAGE_SIZES.A4);
  });
});

describe('orient', () => {
  it('turns the paper rather than reshaping it', () => {
    expect(orient(PAGE_SIZES.A4, true)).toEqual({
      width: PAGE_SIZES.A4.height,
      height: PAGE_SIZES.A4.width,
    });
  });
});

describe('fitInto', () => {
  const page = { width: 200, height: 100 };

  it('scales to the tighter axis and keeps the ratio', () => {
    const rect = fitInto({ width: 100, height: 100 }, page);
    expect(rect).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });

  it('centres the slack on both axes', () => {
    const rect = fitInto({ width: 100, height: 25 }, page);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(50);
    expect(rect.y).toBe(25);
  });

  it('takes the margin off both sides before fitting', () => {
    const rect = fitInto({ width: 1, height: 1 }, page, 10);
    expect(rect.height).toBe(80);
    expect(rect.x).toBeCloseTo(60);
  });

  it('never returns a negative slot when the margin eats the page', () => {
    const rect = fitInto(
      { width: 1, height: 1 },
      { width: 10, height: 10 },
      20,
    );
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('measures a margin in millimetres a person can picture', () => {
    expect(10 * MM).toBeCloseTo(28.35, 1);
  });
});
