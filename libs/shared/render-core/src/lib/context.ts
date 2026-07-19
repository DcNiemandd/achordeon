// LayoutContext — Epic 3 ▸ resolved styles + slot metrics
// Spec: PRD-RENDERING §4.7 (pitch source), §4.10 (per-role style). Bundles the
// per-render facts the geometry passes share: the resolved per-role `TextStyle`,
// the string-independent line-pitch metrics, the bound `measure`, and viewer
// opts. Built once at the top of `layout`, threaded read-only through every
// sub-pass so no pass re-resolves styles or re-measures the font box.

import type { GlobalSettings } from '@achordeon/shared/domain';
import type { TextMeasurer, FontSpec } from './text-measurer';
import type { TextRole, TextStyle } from './render-plan';
import type { RenderTuning } from './tuning';

/** String-independent line-pitch for one role (§4.7). `height` = ascent+descent. */
export interface RoleMetrics {
  ascent: number;
  descent: number;
  height: number;
}

export interface LayoutContext {
  measure: TextMeasurer;
  tuning: RenderTuning;
  styles: Record<TextRole, TextStyle>;
  metrics: Record<TextRole, RoleMetrics>;
  hideChords: boolean;
}

/** A representative glyph pair — ascender + descender — for the font box probe. */
const BOX_SAMPLE = 'Mg';

/** The `FontSpec` half of a `TextStyle` (what `measure` consumes). */
export function toFontSpec(style: TextStyle): FontSpec {
  return {
    family: style.family,
    sizePx: style.sizePx,
    weight: style.weight,
    style: style.style,
    // Carried, not dropped: measuring must name the same stack `emit` draws with.
    fallback: style.fallback,
  };
}

/** Resolve the per-role `TextStyle` from tuning + the (already-cascaded) settings. */
export function resolveStyles(
  settings: GlobalSettings,
  tuning: RenderTuning,
): Record<TextRole, TextStyle> {
  const roles = Object.keys(tuning.typography) as TextRole[];
  const styles = {} as Record<TextRole, TextStyle>;
  for (const role of roles) {
    const t = tuning.typography[role];
    // Chords are the only role that carries a user setting: size (× chordSize)
    // and colour (chordColor). Every other role is fixed by tuning (§4.10).
    const chordScale = role === 'chord' ? settings.chordSize : 1;
    styles[role] = {
      family: tuning.fontFamily,
      sizePx: tuning.baseSizePx * t.sizeFactor * chordScale,
      weight: t.weight,
      style: t.style,
      // Chords are the one user-coloured role. Everything else takes its own
      // `color` if tuning names one (the PoC's grey subtitle) and `textColor`
      // otherwise.
      fill:
        role === 'chord' ? settings.chordColor : (t.color ?? tuning.textColor),
      fallback: tuning.fallbackStack,
    };
  }
  return styles;
}

/** Probe the font box once per role for the vertical rhythm (§4.7). */
export function resolveMetrics(
  measure: TextMeasurer,
  styles: Record<TextRole, TextStyle>,
): Record<TextRole, RoleMetrics> {
  const roles = Object.keys(styles) as TextRole[];
  const metrics = {} as Record<TextRole, RoleMetrics>;
  for (const role of roles) {
    const m = measure.measure(BOX_SAMPLE, toFontSpec(styles[role]));
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    metrics[role] = { ascent, descent, height: ascent + descent };
  }
  return metrics;
}

export function createContext(
  settings: GlobalSettings,
  measure: TextMeasurer,
  tuning: RenderTuning,
  hideChords: boolean,
): LayoutContext {
  const styles = resolveStyles(settings, tuning);
  return {
    measure,
    tuning,
    styles,
    metrics: resolveMetrics(measure, styles),
    hideChords,
  };
}
