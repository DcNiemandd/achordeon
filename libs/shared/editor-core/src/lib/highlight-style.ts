// Achordeon token colours — Epic 5 ▸ subtask 4
// Spec: ADR-0010 (the grammar and its colouring are one decision)

import { HighlightStyle } from '@codemirror/language';

import { achordeonTags } from './highlight';

/**
 * Our tags → our colours.
 *
 * **The colours are custom properties, never literals**, and that is what lets
 * this be shared. The app draws the editor in its own tokens (`_tokens.scss`)
 * and the docs site in Infima's; both mean the same four things by them, so the
 * host supplies the palette and this file supplies the mapping:
 *
 * - `--brand` — the accent the chords are set in
 * - `--text` — ordinary text
 * - `--text-muted` — subordinate text (a subtitle, a label)
 * - `--text-faint` — syntax that is not content (the `*` markers, an escape)
 *
 * A host that defines none of them gets a legible editor in the inherited colour
 * rather than an invisible one: an undefined `var()` on `color` falls back to
 * the inherited value.
 */
export function achordeonHighlightStyle(): HighlightStyle {
  return HighlightStyle.define([
    { tag: achordeonTags.title, color: 'var(--text)', fontWeight: '700' },
    {
      tag: achordeonTags.subtitle,
      color: 'var(--text-muted)',
      fontWeight: '500',
    },
    {
      tag: achordeonTags.label,
      color: 'var(--text-muted)',
      fontWeight: '700',
    },
    // Chords are the brand colour, as they are in the render: the editor should
    // rhyme with the page it is producing.
    { tag: achordeonTags.chord, color: 'var(--brand)', fontWeight: '700' },
    {
      tag: achordeonTags.annotation,
      color: 'var(--text-faint)',
      fontStyle: 'italic',
    },
    // The escaping backslash stays dim — it is syntax, not text. The char it
    // protects is coloured as ordinary text by the grammar, not here.
    { tag: achordeonTags.escape, color: 'var(--text-faint)' },
    // Emphasis: the text shows the style it will render in, and the `*` markers
    // are dimmed so they read as syntax around it.
    { tag: achordeonTags.emphasis, color: 'var(--text-faint)' },
    { tag: achordeonTags.italic, fontStyle: 'italic' },
    { tag: achordeonTags.bold, fontWeight: '700' },
    {
      tag: achordeonTags.bolditalic,
      fontStyle: 'italic',
      fontWeight: '700',
    },
  ]);
}
