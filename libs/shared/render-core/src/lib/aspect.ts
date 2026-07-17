// Aspect-ratio parsing — Epic 3 ▸ subtask 3 (render box shape)
// Spec: PRD-RENDERING §4.1 (render box shape = `aspectRatio`, always user-owned).
// The `aspectRatio` setting is `'A4' | number | 'w:h' | 'w/h'`; the renderer
// needs a single numeric width÷height. Total (never throws): unparseable input
// falls back to A4 portrait so the pipeline stays crash-free like the parser.

import type { GlobalSettings } from '@achordeon/shared/domain';

/** A4 portrait, width ÷ height (210mm × 297mm). */
export const A4_RATIO = 210 / 297;

/**
 * Resolve the `aspectRatio` setting to a numeric width÷height. Accepts the 'A4'
 * preset, a bare number (already a ratio), or `'w:h'` / `'w/h'` strings.
 * Non-positive or malformed values fall back to A4 portrait.
 */
export function parseAspectRatio(value: GlobalSettings['aspectRatio']): number {
  if (typeof value === 'number') {
    return value > 0 ? value : A4_RATIO;
  }
  if (value === 'A4') {
    return A4_RATIO;
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (match) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w > 0 && h > 0) {
      return w / h;
    }
  }
  // A bare number, as TEXT. CONTEXT.md §Render settings says the input accepts
  // "N:N, N (float), N/N, or A4" — and every value that reaches here from a GUI
  // is a string, because that is what an <input> and an <option> hold. Parsing
  // "3:4" but not "0.75" made a typed ratio silently render as A4.
  const bare = Number(value);
  if (Number.isFinite(bare) && bare > 0) {
    return bare;
  }
  return A4_RATIO;
}
