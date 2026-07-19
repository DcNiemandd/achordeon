// Font catalog — the named faces a song may choose from
// Spec: PRD-RENDERING §4.10 (fonts, chord colour & chord size)
//
// The seam between a *setting* ("the title is set in a serif") and the *bytes*
// that eventually draw it. A choice is a name; resolving it yields the family +
// fallback stack that `measure` and `emit` both name — and those two must always
// agree, or the geometry describes a font the browser never draws with.
//
// **Today every choice resolves to a CSS generic**, which needs no bundled bytes
// and renders on any platform. That is deliberately an interim: a generic is
// whatever the *viewer's* machine calls "a serif", so two people see different
// pages and an exported PDF cannot embed it at all. Epic 7 replaces the right-
// hand side of this map with real bundled TTFs; nothing above it changes, because
// a caller only ever names a choice.

import type { RenderTuning } from './tuning';

/** The `titleFont` setting's values. One name per entry in `resolveFontChoice`. */
export type FontChoiceName = 'body' | 'serif' | 'sans';

export interface ResolvedFont {
  family: string;
  /** CSS generic(s) after `family`, for both the SVG and the measurer. */
  fallback: string;
}

/**
 * A choice name → the font to measure and draw with.
 *
 * `body` is not a font of its own: it means "whatever the rest of the song is
 * set in", so it follows `tuning.fontFamily` rather than pinning a second copy
 * of that decision here.
 */
export function resolveFontChoice(
  name: FontChoiceName | undefined,
  tuning: RenderTuning,
): ResolvedFont {
  switch (name) {
    case 'serif':
      return { family: 'ui-serif', fallback: 'Georgia, Cambria, serif' };
    case 'sans':
      return {
        family: 'ui-sans-serif',
        fallback: 'system-ui, Segoe UI, Helvetica, Arial, sans-serif',
      };
    case 'body':
    default:
      return { family: tuning.fontFamily, fallback: tuning.fallbackStack };
  }
}
