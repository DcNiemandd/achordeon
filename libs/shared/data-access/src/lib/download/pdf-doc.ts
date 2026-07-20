// SVG → PDF — Epic 7 ▸ subtasks 4 and 7 (the guardrail)
// Spec: PRD-RENDERING §3 (**SSOT**: v1 PDF is vector, via `svg2pdf.js` + jsPDF;
// fonts registered with `addFileToVFS`/`addFont` so the text is selectable, not
// outlined; a missing registration is a hard fail because the PDF path has no
// generic fallback).
//
// The one place jsPDF and svg2pdf are named. Everything above deals in "a page
// with a song on it".
//
// **Loaded on demand.** Together they are ~500 KB, and a user who never presses
// Download must not pay for them on first paint — the app's initial budget is
// 1 MB and this alone would break it. `import()` here is what keeps the cost on
// the gesture that asked for it. Types are imported statically, which the
// compiler erases.

import type { jsPDF } from 'jspdf';
import type { EmbeddedFont } from '@achordeon/shared/render-core';
import type { Rect, Size } from './page-geometry';

type PdfKit = {
  jsPDF: typeof jsPDF;
  svg2pdf: (
    element: Element,
    pdf: jsPDF,
    options?: { x: number; y: number; width: number; height: number },
  ) => Promise<unknown>;
};

/** One load per session, shared by every download after the first. */
let kit: Promise<PdfKit> | undefined;

function loadKit(): Promise<PdfKit> {
  kit ??= Promise.all([import('jspdf'), import('svg2pdf.js')]).then(
    ([jspdf, svg]) => ({
      jsPDF: jspdf.jsPDF,
      svg2pdf: svg.svg2pdf as PdfKit['svg2pdf'],
    }),
  );
  return kit;
}

/** jsPDF wants a VFS filename per face; the id it draws by is the family. */
function vfsName(font: EmbeddedFont): string {
  return `${font.family}-${font.weight}-${font.style}.ttf`.replace(/\s+/g, '');
}

/**
 * Register every face the plan carries.
 *
 * This is the §3 guardrail in code: the SVG names a family and then a CSS
 * generic, and the PDF has **no** generic to fall back to — an unregistered
 * family silently becomes Helvetica, with every chord landing over the wrong
 * character because Helvetica is not what the geometry was measured against. So
 * the faces are registered from the same `RenderPlan.fonts` the SVG inlined.
 */
export function registerFonts(
  doc: jsPDF,
  fonts: readonly EmbeddedFont[],
): void {
  for (const font of fonts) {
    if (!font.base64) continue;
    const name = vfsName(font);
    doc.addFileToVFS(name, font.base64);
    // (file, family, style, weight) — svg2pdf looks the face up by the family
    // and the style/weight it reads off the SVG, so these three have to be
    // spelled exactly the way `emit` spelled them.
    doc.addFont(name, font.family, font.style, font.weight);
  }
}

/** A document whose first page is `size`, in points. */
export async function createPdf(size: Size): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await loadKit();
  return new JsPdf({
    unit: 'pt',
    format: [size.width, size.height],
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    // Uncompressed: the file is bigger, and every byte of it is greppable. It is
    // also what lets the guardrail e2e assert the text is really *text* in the
    // page stream rather than trusting the library's word for it.
    compress: false,
  });
}

/** The SVG string as the element `svg2pdf` walks. */
export function parseSvg(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName === 'parsererror' || root.querySelector('parsererror')) {
    throw new Error('The rendered SVG could not be parsed for the PDF.');
  }
  return root;
}

/** Draw one SVG into the current page, at `where`. */
export async function drawSvg(
  doc: jsPDF,
  svg: string,
  where: Rect,
): Promise<void> {
  const { svg2pdf } = await loadKit();
  await svg2pdf(parseSvg(svg), doc, {
    x: where.x,
    y: where.y,
    width: where.width,
    height: where.height,
  });
}
