// TextMeasurer port — Epic 3 ▸ subtask 1
// Spec: PRD-RENDERING §1 (portability note), §5 (the `measure` port), §4.7 (pitch source).
//
// The ONLY way `layout` obtains pixel metrics. A char index becomes a pixel x
// through here — no canvas/DOM reaches into the geometry brain. Mirrors the
// `ChordTheory` port (ADR-0008): an injected seam so geometry is testable
// against a fake (jsdom canvas returns width 0, so a DOM-free seam is required).

/** What to measure with. A resolved font, never a CSS shorthand string. */
export interface FontSpec {
  family: string;
  sizePx: number;
  weight: 'normal' | 'bold';
  style?: 'normal' | 'italic';
}

/**
 * Metrics for one measured string. `fontBoundingBox*` is the
 * string-independent line-pitch source (§4.7), never `actualBoundingBox`
 * (glyph-tight → jittery baselines). `width` is the advance of `text`.
 */
export interface TextMetrics {
  width: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;
}

/** The measurement port. Bound once as a platform dependency (§5). */
export interface TextMeasurer {
  measure(text: string, font: FontSpec): TextMetrics;
}

/**
 * Raw metrics as a 2D canvas returns them: `width` is always present, but the
 * `fontBoundingBox*` fields are missing on older engines / jsdom — the exact
 * reason `normalizeMetrics` exists. Distinct from `TextMetrics`, which is the
 * normalized (fields-guaranteed) result.
 */
export type RawTextMetrics = Partial<TextMetrics> & Pick<TextMetrics, 'width'>;

/**
 * Normalise raw canvas metrics into a usable box (§4.7 graceful fallback). If
 * `fontBoundingBox{Ascent,Descent}` come back missing or zero (older engines,
 * jsdom), synthesise a box from `sizePx` split by a fixed leading factor so
 * line pitch never collapses to 0. Pure — the one piece of the canvas measurer
 * worth unit-testing.
 */
export function normalizeMetrics(
  raw: RawTextMetrics,
  sizePx: number,
  fallbackLeading: number,
): TextMetrics {
  const ascent = raw.fontBoundingBoxAscent;
  const descent = raw.fontBoundingBoxDescent;
  const isUsable =
    typeof ascent === 'number' &&
    typeof descent === 'number' &&
    ascent + descent > 0;
  if (isUsable) {
    return {
      width: raw.width,
      fontBoundingBoxAscent: ascent as number,
      fontBoundingBoxDescent: descent as number,
    };
  }
  // Split the leaded em ~80/20 ascent/descent — a conventional text-baseline ratio.
  const total = sizePx * fallbackLeading;
  return {
    width: raw.width,
    fontBoundingBoxAscent: total * 0.8,
    fontBoundingBoxDescent: total * 0.2,
  };
}

/** Build the CSS `font` shorthand a 2D canvas context expects. */
export function fontShorthand(font: FontSpec): string {
  const style = font.style && font.style !== 'normal' ? `${font.style} ` : '';
  return `${style}${font.weight} ${font.sizePx}px ${font.family}`;
}
