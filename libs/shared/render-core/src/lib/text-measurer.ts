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
  /**
   * The CSS generic(s) after `family` — the SAME fallback `emit` writes.
   *
   * Load-bearing: `measure` and `emit` must name the identical font stack, or
   * the geometry describes a font the browser never draws with. When the bundled
   * family is missing (it always is on screen — the face is CSS-loaded, and there
   * is no face at all today), the canvas falls back to *its* default while the
   * SVG falls back to *this* stack. Those are different fonts with different
   * metrics, and every measured width is then wrong: lyrics were laid out to a
   * box narrower than they drew, and ran off the page.
   */
  fallback?: string;
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
 * A measurer that memoises, and can therefore be told its answers went stale.
 *
 * The one thing that invalidates a cached metric is the **font arriving**. A
 * web-loaded face is not there on the first frame, so a measurement taken before
 * it lands describes the fallback font — and a permanent cache would keep
 * describing it forever, leaving every chord a few pixels off its character for
 * the rest of the session. The platform adapter that knows when fonts settle
 * (`document.fonts.ready`) calls `clear()`; the geometry core neither knows nor
 * cares that this happened.
 */
export interface CachingTextMeasurer extends TextMeasurer {
  clear(): void;
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

/**
 * Build the CSS `font` shorthand a 2D canvas context expects.
 *
 * Quoted family + the fallback stack, so this string names exactly the stack
 * `emit` writes into `font-family` (see `FontSpec.fallback`).
 */
export function fontShorthand(font: FontSpec): string {
  const style = font.style && font.style !== 'normal' ? `${font.style} ` : '';
  const family = font.fallback
    ? `'${font.family}', ${font.fallback}`
    : `'${font.family}'`;
  return `${style}${font.weight} ${font.sizePx}px ${family}`;
}
