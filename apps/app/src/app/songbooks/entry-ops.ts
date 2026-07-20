// Songbook entry order — Epic 6 ▸ subtask 3
// Spec: CONTEXT.md §Songbook (Entry/slot); songbooks/index.mdx

import type { Uuid } from '@achordeon/shared/domain';

/**
 * Where an insert lands relative to the **slots selected in the songbook**
 * (songbooks/index.mdx): "to the start, to the end, above selected songbook
 * song, or below".
 */
export type InsertPosition = 'start' | 'end' | 'above' | 'below';

/**
 * The index the incoming songs are spliced at.
 *
 * With nothing selected, `above`/`below` have no anchor to be relative to, so
 * they fall back to the end — the answer to "add these" when you have not said
 * where, and the one that never silently reorders what is already there.
 *
 * A multi-slot selection is bracketed rather than iterated: `above` means above
 * *all* of it, `below` below all of it. Inserting into the middle of a selection
 * would split the thing the user pointed at.
 */
export function insertionIndex(
  length: number,
  selected: ReadonlySet<number>,
  where: InsertPosition,
): number {
  const indexes = [...selected].filter((i) => i >= 0 && i < length);
  switch (where) {
    case 'start':
      return 0;
    case 'end':
      return length;
    case 'above':
      return indexes.length ? Math.min(...indexes) : length;
    case 'below':
      return indexes.length ? Math.max(...indexes) + 1 : length;
  }
}

/**
 * Splice songs into the order at `at`.
 *
 * **Duplicates are the point**, not an accident to guard against: a slot is a
 * position, and the same song may fill several of them (CONTEXT.md §Songbook) —
 * a set that plays the opener again at the end is two slots, one song.
 */
export function insertEntries(
  entries: readonly Uuid[],
  songIds: readonly Uuid[],
  at: number,
): Uuid[] {
  const index = Math.min(Math.max(at, 0), entries.length);
  return [...entries.slice(0, index), ...songIds, ...entries.slice(index)];
}

/**
 * The slot selection after an insert at `at`: every slot below the splice keeps
 * its identity but has moved down by `count`.
 *
 * Without this the checked rows stay put by *index* and silently come to mean
 * different songs — the selection would appear to jump the moment you add above
 * it.
 */
export function shiftSelection(
  selected: ReadonlySet<number>,
  at: number,
  count: number,
): Set<number> {
  return new Set([...selected].map((i) => (i >= at ? i + count : i)));
}
