import { fitContent } from './fit';

describe('fitContent — scale-to-fit (§4.1)', () => {
  it('wraps a content box in the tight render box of the ratio (wider than ratio)', () => {
    // content 200x100 (ratio 2), target ratio 1 → grow height to 200
    const r = fitContent(200, 100, 1, 'auto');
    expect(r.box).toEqual({ width: 200, height: 200 });
    expect(r.fit).toBe(1);
    expect(r.origin).toEqual({ x: 0, y: 0 });
  });

  it('grows width when content is taller than the ratio', () => {
    // content 100x200 (ratio 0.5), target ratio 1 → grow width to 200
    expect(fitContent(100, 200, 1, 'auto').box).toEqual({
      width: 200,
      height: 200,
    });
  });

  it('leaves the box tight when content already matches the ratio', () => {
    expect(fitContent(300, 150, 2, 'auto').box).toEqual({
      width: 300,
      height: 150,
    });
  });

  it('applies a manual scale as the fit (box stays base-tight, may overflow)', () => {
    const r = fitContent(200, 100, 1, 1.5);
    expect(r.fit).toBe(1.5);
    expect(r.box).toEqual({ width: 200, height: 200 }); // box independent of scale
  });

  it('falls back to fit 1 on a non-positive manual scale', () => {
    expect(fitContent(100, 100, 1, 0).fit).toBe(1);
  });

  it('returns a zero box for empty content', () => {
    expect(fitContent(0, 0, 1, 'auto').box).toEqual({ width: 0, height: 0 });
  });

  it('honours a manual scale given as text', () => {
    // Same trap as parseAspectRatio: the GUI hands over strings, and a
    // `typeof scale === 'number'` test alone turned every typed scale into
    // 'auto' — the setting looked saved and did nothing.
    expect(fitContent(200, 100, 1, '2' as never).fit).toBe(2);
    expect(fitContent(200, 100, 1, '0.5' as never).fit).toBe(0.5);
  });

  it('treats auto and unusable scales as 1', () => {
    expect(fitContent(200, 100, 1, 'auto').fit).toBe(1);
    expect(fitContent(200, 100, 1, '' as never).fit).toBe(1);
    expect(fitContent(200, 100, 1, 'huge' as never).fit).toBe(1);
    expect(fitContent(200, 100, 1, -2).fit).toBe(1);
  });
});

describe('fitContent — alignment (Epic 7: the title page)', () => {
  it('hugs the top-left corner by default, as a song does', () => {
    const { origin } = fitContent(100, 100, 1 / 2, 'auto');
    expect(origin).toEqual({ x: 0, y: 0 });
  });

  it('centres the content in the slack the ratio created', () => {
    // A square of content in a box twice as tall: the slack is all vertical.
    const { box, origin } = fitContent(100, 100, 1 / 2, 'auto', 0, 'center');
    expect(box).toEqual({ width: 100, height: 200 });
    expect(origin).toEqual({ x: 0, y: 50 });
  });

  it('centres in the slack the auto-fit floor created too', () => {
    // The floor grows the box around content that keeps its size — which is
    // precisely the case a title page is: three lines on a sheet of paper.
    const { box, origin } = fitContent(20, 20, 1, 'auto', 200, 'center');
    expect(box).toEqual({ width: 200, height: 200 });
    expect(origin).toEqual({ x: 90, y: 90 });
  });

  it('lets an overflowing manual scale bleed evenly, not off one corner', () => {
    // A manual scale may overflow (§4.1, no clamp) and the floor does not apply
    // to it — so the box stays 50×50 around content drawn at 100×100. Centred,
    // that hangs 25 off each side instead of 50 off the bottom-right.
    const { origin } = fitContent(50, 50, 1, 2, 200, 'center');
    expect(origin).toEqual({ x: -25, y: -25 });
  });
});
