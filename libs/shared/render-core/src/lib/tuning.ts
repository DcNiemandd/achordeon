// RenderTuning — Epic 3 ▸ dev-facing tuning knobs
// Spec: PRD-RENDERING §4.7/§4.8/§4.9/§4.10 ("spacing magnitudes are tunable
// internal constants, NOT render settings").
//
// This is the renderer author's control surface: every geometry magnitude and
// visual-policy choice the PRD flags as "tunable" is a field here with a chosen
// default. It is DISTINCT from the user-facing SETTINGS registry (scale,
// columns, aspectRatio, chordColor, …): those cascade and persist per entity;
// these do not. A dev threads a partial `RenderTuning` into `createLayout` to
// A/B a magnitude; users never see any of this. Defaults are the author's taste
// (§4.7: "deliberately not grilled").
//
// Units convention:
//   *Factor  — multiple of a VERTICAL slot (lyric or chord line pitch).
//   *Em      — multiple of the base font size (horizontal whitespace).
//   *Multiplier / *Ratio — dimensionless scale of a measured quantity.

import type { TextRole } from './render-plan';

/** Per-role font selection, relative to the base lyric size. */
export interface RoleTypography {
  /** Font size as a multiple of `baseSizePx`. Chords additionally × the `chordSize` setting. */
  sizeFactor: number;
  weight: 'normal' | 'bold';
  style?: 'normal' | 'italic';
}

export interface RenderTuning {
  /** The base reference lyric size, in base units. All role sizes derive from it (§4.1). */
  baseSizePx: number;

  /** The one bundled v1 family (§4.10). Bytes are injected via the FontBook seam. */
  fontFamily: string;
  /** CSS generic(s) appended after the family in the SVG `font-family` (§4.10 fallback). */
  fallbackStack: string;
  /** Fill for every non-chord role; chords use the `chordColor` setting (§4.10). */
  textColor: string;

  /** Per-role size/weight/style. Chord `sizeFactor` is pre-`chordSize` (§4.10). */
  typography: Record<TextRole, RoleTypography>;

  spacing: {
    /** Extra leading between successive lines, × the line's own pitch. 0 = pitch only (§4.7). */
    lineLeadingFactor: number;
    /** Gap between blocks, × a lyric slot (§4.7 "≈ one lyric line slot"). */
    interBlockGapFactor: number;
    /** Gap between the chord row and its lyric slot, × chord-row height. 0 = abut (§4.7). */
    chordRowGapFactor: number;
    /** Horizontal gap between content columns, × `baseSizePx` (§4.2). */
    columnGapEm: number;
    /** Gap after an inline label before content begins, × `baseSizePx` (§4.8 gutter). */
    gutterGapEm: number;
    /** Gap between the title block and content, × a lyric slot (top) / `baseSizePx` (spine) (§4.5). */
    titleGapFactor: number;
    /** Gap between title and subtitle when stacked, × the subtitle slot (§4.5). */
    titleStackGapFactor: number;
    /** Gap between title and subtitle when inline, × `baseSizePx` (§4.5). */
    titleInlineGapEm: number;
  };

  /** All-chord-only Block renders larger (§4.9 bridge). Applied in base units before the fit. */
  bridgeSizeMultiplier: number;

  /** How a chord-only line spreads its chords across the column width (§4.9). */
  chordOnlyDistribution: 'justified' | 'left';

  /** Members of a same-index anchor group are joined by this string in the chord font (§4.6). */
  sameIndexJoiner: string;

  /** Allow different-index chords to overlap rather than shove (§4.6). Fixed true in v1; a seam. */
  overlapChords: boolean;

  /** §4.7 fallback: synthesised leading when `fontBoundingBox*` is unavailable. */
  fontBoundingBoxFallbackLeading: number;
}

/**
 * The author's chosen defaults. Every value is a visual-tuning detail — change
 * freely; none is a user setting. Kept as one frozen object so a caller spreads
 * `{ ...DEFAULT_TUNING, ...overrides }` to tweak a single knob.
 */
export const DEFAULT_TUNING: RenderTuning = {
  baseSizePx: 16,
  fontFamily: 'Achordeon',
  fallbackStack: 'ui-sans-serif, system-ui, sans-serif',
  textColor: '#000000',
  typography: {
    title: { sizeFactor: 1.75, weight: 'bold' },
    subtitle: { sizeFactor: 1.15, weight: 'normal' },
    label: { sizeFactor: 1.0, weight: 'bold' },
    lyric: { sizeFactor: 1.0, weight: 'normal' },
    chord: { sizeFactor: 1.0, weight: 'bold' },
  },
  spacing: {
    lineLeadingFactor: 0,
    interBlockGapFactor: 1.0,
    chordRowGapFactor: 0,
    columnGapEm: 2.0,
    gutterGapEm: 0.5,
    titleGapFactor: 1.0,
    titleStackGapFactor: 0.15,
    titleInlineGapEm: 0.75,
  },
  bridgeSizeMultiplier: 1.2,
  chordOnlyDistribution: 'justified',
  sameIndexJoiner: ' ',
  overlapChords: true,
  fontBoundingBoxFallbackLeading: 1.2,
};

/** Deep-merge a partial override onto `DEFAULT_TUNING` (one level of nesting). */
export function resolveTuning(
  overrides?: DeepPartial<RenderTuning>,
): RenderTuning {
  if (!overrides) return DEFAULT_TUNING;
  return {
    ...DEFAULT_TUNING,
    ...overrides,
    typography: mergeTypography(overrides.typography),
    spacing: { ...DEFAULT_TUNING.spacing, ...overrides.spacing },
  };
}

function mergeTypography(
  o?: DeepPartial<RenderTuning['typography']>,
): RenderTuning['typography'] {
  if (!o) return DEFAULT_TUNING.typography;
  const base = DEFAULT_TUNING.typography;
  const out = {} as RenderTuning['typography'];
  for (const role of Object.keys(base) as TextRole[]) {
    out[role] = { ...base[role], ...o[role] };
  }
  return out;
}

/** Recursive partial — every nested field optional, for spreading overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
