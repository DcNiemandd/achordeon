// SVG → PNG — Epic 7 ▸ subtask 4
// Spec: ADR-0002 / PRD-RENDERING §2 (PNG is a *sink* on the one SVG:
// `drawImage(svg → canvas)`, no `foreignObject`, so it works in every browser),
// §4.1 ("raster scale" — an export-only DPI knob, not a render setting).
//
// The `foreignObject` technique the HTML/CSS proof-of-concept used is why PNG
// was Chromium-only. An `<img>` pointed at a plain SVG has no such problem — but
// it will not fetch anything from inside that SVG, which is why the export SVG
// must carry its fonts base64-inlined (`emit({ inlineFonts: true })`).

/** The short side of a rasterized PNG, in pixels — the PoC's number (§4.1). */
export const RASTER_SHORT_SIDE = 1920;

export interface RasterOpts {
  /** Pixels on the short side. Bigger = sharper and heavier; geometry is untouched. */
  readonly shortSide?: number;
}

/**
 * Rasterize a self-contained SVG string.
 *
 * The image is drawn onto an opaque white canvas: a PNG with a transparent
 * background looks identical in a viewer and prints as nothing on dark paper —
 * and this is a document, which has a page.
 */
export async function svgToPng(
  svg: string,
  box: { width: number; height: number },
  opts: RasterOpts = {},
): Promise<Blob> {
  const shortSide = opts.shortSide ?? RASTER_SHORT_SIDE;
  const scale = shortSide / Math.max(Math.min(box.width, box.height), 1);
  const width = Math.max(Math.round(box.width * scale), 1);
  const height = Math.max(Math.round(box.height * scale), 1);

  const image = await loadSvg(svg);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context for the PNG export.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Canvas produced no PNG.')),
      'image/png',
    );
  });
}

/**
 * The SVG as a decoded image.
 *
 * A `data:` URL rather than a blob URL: Safari taints a canvas drawn from a blob
 * URL carrying an SVG, and a tainted canvas cannot be read back — `toBlob`
 * throws and the download produces nothing. `encodeURIComponent` (not base64)
 * keeps it debuggable and handles the UTF-8 in a Czech lyric.
 */
function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The SVG could not be decoded.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
