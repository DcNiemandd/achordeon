// Font catalog — the named faces a song may choose from
// Spec: PRD-RENDERING §4.10 (fonts, chord colour & chord size)
//
// The seam between a *setting* ("the title is set in a serif") and the *bytes*
// that eventually draw it. A choice is a name; resolving it yields the family +
// fallback stack that `measure` and `emit` both name — and those two must always
// agree, or the geometry describes a font the browser never draws with.
//
// **Every choice now resolves to a bundled TTF** (Epic 7). It used to resolve to
// a CSS generic, which was honest about needing no bytes and dishonest about
// everything else: a generic is whatever the *viewer's* machine calls "a serif",
// so two people saw different pages and an exported PDF could embed nothing.
// Nothing above the catalog changed, because a caller only ever names a choice.
//
// The three title families are §4.10's recommended set — a serif, a
// condensed/display and a script — chosen because they are the ones that look
// unlike Roboto Mono at title size. The CSS fallback after each is kept for the
// frame or two before the face has loaded (the bytes are fetched on first use,
// not precached); the PDF has no fallback at all, which is why the family a plan
// names and the bytes it carries have to come from this one map.

import type { RenderTuning } from './tuning';

/** The `titleFont` setting's values. One name per entry in `resolveFontChoice`. */
export type FontChoiceName = 'body' | 'serif' | 'display' | 'script';

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
      return { family: 'Crimson Text', fallback: 'Georgia, Cambria, serif' };
    case 'display':
      return {
        family: 'Oswald',
        fallback: "'Arial Narrow', system-ui, sans-serif",
      };
    case 'script':
      return { family: 'Caveat', fallback: 'cursive' };
    case 'body':
    default:
      // Also where a *retired* choice lands. `titleFont` briefly offered
      // `'sans'`, which resolved to a CSS generic and so could never be
      // embedded; a song still carrying it now reads as body, which is the
      // setting's own default and the one answer that is never wrong.
      return { family: tuning.fontFamily, fallback: tuning.fallbackStack };
  }
}

/** The choices a settings GUI offers, in the order it offers them. */
export const FONT_CHOICES: readonly FontChoiceName[] = [
  'body',
  'serif',
  'display',
  'script',
];
