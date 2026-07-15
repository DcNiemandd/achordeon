// Deterministic fake TextMeasurer — Epic 3 ▸ subtask 1
// Spec: PRD-RENDERING §1 (a fake measurer is what makes geometry assertable).
// A monospace model: width scales linearly with character count, box scales with
// font size. Chosen so tests can assert exact pixel x's (chord "C" at x = 3·adv).
// Exported for downstream feature-lib layout tests too — not just this lib.

import type { FontSpec, TextMeasurer, TextMetrics } from './text-measurer';

export interface FakeMeasurerRatios {
  /** Advance width per character, as a fraction of `sizePx`. */
  advance: number;
  /** `fontBoundingBoxAscent` as a fraction of `sizePx`. */
  ascent: number;
  /** `fontBoundingBoxDescent` as a fraction of `sizePx`. */
  descent: number;
}

export const DEFAULT_FAKE_RATIOS: FakeMeasurerRatios = {
  advance: 0.6,
  ascent: 0.8,
  descent: 0.2,
};

/**
 * A pure, DOM-free `TextMeasurer` for tests and headless callers. Every glyph is
 * `advance·sizePx` wide regardless of family, so positions are hand-computable.
 */
export function createFakeMeasurer(
  ratios: Partial<FakeMeasurerRatios> = {},
): TextMeasurer {
  const r = { ...DEFAULT_FAKE_RATIOS, ...ratios };
  return {
    measure(text: string, font: FontSpec): TextMetrics {
      return {
        width: text.length * font.sizePx * r.advance,
        fontBoundingBoxAscent: font.sizePx * r.ascent,
        fontBoundingBoxDescent: font.sizePx * r.descent,
      };
    },
  };
}
