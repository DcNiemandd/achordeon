// Keyboard shortcuts — the key, said on the control that carries it
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md;
//       CONTEXT.md §Keyboard shortcut

import { describeShortcut, type ShortcutKey } from './key-press';

/** Between the two presses of a leader chord: `G` **then** `S`. The dialog
 * prints the same word between the same two caps. */
const THEN = $localize`:@@shortcuts.then:then`;

/**
 * One shortcut written out as a line of text — `Alt+C`, `G then S`.
 *
 * The dialog is the authoritative map, but a map is something you have to know
 * to open. This is the other half: the key said **on the button that already
 * does the thing**, where somebody reaching for the mouse will read it without
 * having been told it exists.
 */
export function shortcutHint(
  key: ShortcutKey,
  labels?: ReadonlyMap<string, string>,
): string {
  return describeShortcut(key, labels)
    .map((caps) => caps.join('+'))
    .join(` ${THEN} `);
}

/** `Chord (Alt+C)` — a control's name with its key after it, for the tooltip.
 * The name stays first and unchanged, because it is also the accessible name
 * the control announces. */
export function withKeyHint(
  label: string,
  key: ShortcutKey,
  labels?: ReadonlyMap<string, string>,
): string {
  return `${label} (${shortcutHint(key, labels)})`;
}
