// Font seam — Epic 3 ▸ subtask 2 (bytes) / subtask 8 (embedding)
// Spec: PRD-RENDERING §2 (self-contained SVG), §4.10 (one font, embedded both
// ways), §3 (jsPDF registration).
//
// The font BYTES are a platform asset, injected like `measureText` — the pure
// core never hardcodes a multi-hundred-KB base64 blob. The Angular/build layer
// supplies the bundled TTFs through a `FontResolver`; `layout` asks it for the
// faces the resolved styles name and puts the answers in `RenderPlan.fonts`;
// `emit` inlines them as `@font-face` (screen/PNG) and `DownloadService`
// (Epic 7) feeds the same bytes to jsPDF `addFileToVFS`/`addFont` (PDF). Screen
// may instead rely on a CSS-loaded face — then the book comes back empty and
// `emit(inlineFonts:false)` omits the `@font-face`.

import type { EmbeddedFont, TextRole, TextStyle } from './render-plan';

/** The embeddable faces for one render. Family/weight/style must match `styles`. */
export type FontBook = EmbeddedFont[];

/** One face, named the way `styles` names it — the key both sides look up by. */
export type FontFaceKey = Pick<EmbeddedFont, 'family' | 'weight' | 'style'>;

/**
 * Bytes for one face, or `undefined` when the platform has none.
 *
 * The book cannot be bound once any more (Epic 7): a song's `titleFont` picks
 * its face at render time, so which bytes a render needs is a function of the
 * *settings*, not of the platform. The platform therefore injects a lookup
 * rather than a list, and `layout` asks it only for the faces the resolved
 * styles actually name — which is what keeps a body-font song from carrying a
 * quarter of a megabyte of script face it never draws with.
 */
export type FontResolver = (face: FontFaceKey) => string | undefined;

function isSameFace(a: FontFaceKey, b: FontFaceKey): boolean {
  return a.family === b.family && a.weight === b.weight && a.style === b.style;
}

/** The distinct faces a resolved style set draws with — deduped, in role order. */
export function collectFaces(
  styles: Record<TextRole, TextStyle>,
): FontFaceKey[] {
  const faces: FontFaceKey[] = [];
  for (const style of Object.values(styles) as TextStyle[]) {
    const face: FontFaceKey = {
      family: style.family,
      weight: style.weight,
      style: style.style ?? 'normal',
    };
    if (!faces.some((f) => isSameFace(f, face))) faces.push(face);
  }
  return faces;
}

/**
 * The book for one render: every face the styles name, carrying bytes where the
 * platform has them.
 *
 * A face the resolver cannot answer is **dropped, not carried empty** — `emit`
 * filters byte-less faces anyway, and the PDF path needs the book to be exactly
 * the list of registrations it can make (§3: a missing registration is a hard
 * fail, so it must be visible as an absence rather than as an empty string).
 */
export function buildFontBook(
  styles: Record<TextRole, TextStyle>,
  resolve: FontResolver,
): FontBook {
  const book: FontBook = [];
  for (const face of collectFaces(styles)) {
    const base64 = resolve(face);
    if (base64) book.push({ ...face, base64 });
  }
  return book;
}

/** Screen path with a CSS-loaded face: nothing to inline. */
export const EMPTY_FONT_BOOK: FontBook = [];

/**
 * A resolver for one bundled family, whatever the weight — the shape a platform
 * with a single face has. Faces of any other family come back `undefined`, which
 * is exactly the "no bytes for this one" answer `buildFontBook` drops.
 */
export function singleFamilyResolver(
  family: string,
  bytes: Partial<Record<'normal' | 'bold', string>>,
): FontResolver {
  return (face) =>
    face.family === family && face.style === 'normal'
      ? bytes[face.weight]
      : undefined;
}
