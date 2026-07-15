// Font seam — Epic 3 ▸ subtask 2 (bytes) / subtask 8 (embedding)
// Spec: PRD-RENDERING §2 (self-contained SVG), §4.10 (one font, embedded both
// ways), §3 (jsPDF registration).
//
// The font BYTES are a platform asset, injected like `measureText` — the pure
// core never hardcodes a multi-hundred-KB base64 blob. The Angular/build layer
// supplies the bundled v1 TTF(s) through `createFontBook`; `layout` copies the
// book into `RenderPlan.fonts`; `emit` inlines the non-empty ones as
// `@font-face` (screen/PNG) and `DownloadService` (Epic 7) feeds the same bytes
// to jsPDF `addFileToVFS`/`addFont` (PDF). Screen may instead rely on a
// CSS-loaded face — then the book carries no bytes and `emit(inlineFonts:false)`
// omits the `@font-face`.

import type { EmbeddedFont } from './render-plan';

/** The embeddable faces for one render. Family/weight/style must match `styles`. */
export type FontBook = EmbeddedFont[];

/** Screen path with a CSS-loaded face: nothing to inline. */
export const EMPTY_FONT_BOOK: FontBook = [];

export interface FontBytes {
  /** Base64 TTF for the regular weight. */
  regular?: string;
  /** Base64 TTF for the bold weight (chords/labels/title use bold, §4.10). */
  bold?: string;
  /** Base64 TTF for the italic face (deferred with markdown-italic, §4.10). */
  italic?: string;
}

/**
 * Assemble a `FontBook` for one bundled `family` from injected base64 bytes.
 * Only the provided weights become faces; a missing weight simply isn't embedded
 * (the SVG falls back to the CSS generic; the PDF path would hard-fail on a
 * missing registration — a §3 guardrail concern for Epic 7, not here).
 */
export function createFontBook(family: string, bytes: FontBytes): FontBook {
  const book: FontBook = [];
  if (bytes.regular) {
    book.push({
      family,
      weight: 'normal',
      style: 'normal',
      base64: bytes.regular,
    });
  }
  if (bytes.bold) {
    book.push({ family, weight: 'bold', style: 'normal', base64: bytes.bold });
  }
  if (bytes.italic) {
    book.push({
      family,
      weight: 'normal',
      style: 'italic',
      base64: bytes.italic,
    });
  }
  return book;
}
