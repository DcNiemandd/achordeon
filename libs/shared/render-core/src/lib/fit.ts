// Scale-to-fit + boxes — Epic 3 ▸ subtask 3
// Spec: PRD-RENDERING §4.1. The content box is the laid-out content at base
// size (medium-independent). The render box's SHAPE is the user-owned
// `aspectRatio`; its size is the tight box of that ratio around the content, so
// the content always fits and the aspect only adds letterbox slack on one axis.
// The fit is a SINGLE UNIFORM scale (vectors scale together, never reflows):
// `auto` = 1 (content already fills the tight box on one axis); a manual number
// overrides and MAY OVERFLOW (user's problem, no clamp). Content hugs top-left.

import type { GlobalSettings } from '@achordeon/shared/domain';

export interface FitResult {
  box: { width: number; height: number };
  fit: number;
  origin: { x: number; y: number };
}

/**
 * Fit a content box (`contentW × contentH`, base units) into a render box of the
 * given `ratio` (width ÷ height) under `scale` ('auto' | number).
 *
 * `contentW/H` arrive **already padded** (§4.11): the caller grew the box by the
 * padding on every side and translated the items into it. Padding is therefore
 * an INSET — it is part of the content box the ratio wraps, so it can never bend
 * the render box away from the user's `aspectRatio`.
 */
/**
 * The manual scale, or 1 for 'auto'.
 *
 * Accepts a numeric **string** as well as a number, for the same reason
 * `parseAspectRatio` does: the settings GUI is inputs and options, and those hold
 * text. `typeof scale === 'number'` alone quietly turned every manually typed
 * scale into 'auto' — the setting looked saved and did nothing.
 */
function parseScale(scale: GlobalSettings['scale']): number {
  const value = typeof scale === 'number' ? scale : Number(scale);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function fitContent(
  contentW: number,
  contentH: number,
  ratio: number,
  scale: GlobalSettings['scale'],
  minBox = 0,
): FitResult {
  const fit = parseScale(scale);
  const origin = { x: 0, y: 0 }; // hug top-left (§4.5)

  if (contentW <= 0 || contentH <= 0) {
    return { box: { width: 0, height: 0 }, fit, origin };
  }

  // Smallest box of `ratio` that contains the content: grow the deficient axis.
  const box =
    contentW / contentH >= ratio
      ? { width: contentW, height: contentW / ratio }
      : { width: contentH * ratio, height: contentH };

  // The auto-fit ceiling (§4.1). The box is what the medium scales to fill, so a
  // box tight around two words IS a magnification instruction: a one-line song
  // came out in letters an inch tall. Growing the box to a floor size caps that —
  // the content keeps its natural size and gains empty page instead. Expressed as
  // a floor on the SHORT axis so portrait and landscape cap alike, and applied to
  // 'auto' only: a manual scale is the user overriding the fit on purpose, and
  // §4.1 already promises not to clamp it.
  if (minBox > 0 && scale === 'auto') {
    const short = Math.min(box.width, box.height);
    if (short > 0 && short < minBox) {
      const grow = minBox / short;
      box.width *= grow;
      box.height *= grow;
    }
  }

  return { box, fit, origin };
}
