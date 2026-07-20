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
/**
 * Where a reorder sends the selected slots (songbooks/index.mdx): "move the song
 * one song over, to the start or to the end".
 */
export type MoveWhere = 'up' | 'down' | 'start' | 'end';

/** A reorder: the new order, and where the selection followed it to. */
export interface MoveResult {
  readonly entries: Uuid[];
  readonly selected: Set<number>;
}

/**
 * Move the selected slots, **carrying the selection with them**.
 *
 * The selection is by index, so a move that did not return the new indexes would
 * leave the ticks pointing at whatever slid into those positions — you would
 * press "up" twice and watch two different songs move.
 *
 * A scattered selection keeps its relative order and compacts against the end it
 * is moving toward: slots already at the wall hold their place and the ones
 * behind them stack up, rather than the whole selection refusing to move because
 * one member cannot.
 */
export function moveEntries(
  entries: readonly Uuid[],
  selected: ReadonlySet<number>,
  where: MoveWhere,
): MoveResult {
  const sorted = [...selected]
    .filter((i) => i >= 0 && i < entries.length)
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { entries: [...entries], selected: new Set(selected) };
  }

  if (where === 'start' || where === 'end') {
    const picked = sorted.map((i) => entries[i]);
    const rest = entries.filter((_, i) => !selected.has(i));
    const at = where === 'start' ? 0 : rest.length;
    return {
      entries: insertEntries(rest, picked, at),
      selected: new Set(picked.map((_, n) => at + n)),
    };
  }

  const result = [...entries];
  const next = new Set<number>();
  // Ascending for "up", descending for "down": each slot must be resolved before
  // the one behind it, or two selected neighbours would swap with each other.
  const order = where === 'up' ? sorted : [...sorted].reverse();
  for (const i of order) {
    const to = where === 'up' ? i - 1 : i + 1;
    // The wall, or a selected slot that has already claimed the target.
    if (to < 0 || to >= result.length || next.has(to)) {
      next.add(i);
      continue;
    }
    [result[to], result[i]] = [result[i], result[to]];
    next.add(to);
  }
  return { entries: result, selected: next };
}

/**
 * Drop slots by index — **remove from songbook, never delete a song**
 * (CONTEXT.md §Delete vs Remove). The song stays in the library; only this
 * positioned reference to it goes.
 *
 * By index and not by song id, for the reason everything here is: the same song
 * may fill several slots, and removing one of them must not take the others.
 */
export function removeEntries(
  entries: readonly Uuid[],
  indexes: ReadonlySet<number>,
): Uuid[] {
  return entries.filter((_, i) => !indexes.has(i));
}

export function shiftSelection(
  selected: ReadonlySet<number>,
  at: number,
  count: number,
): Set<number> {
  return new Set([...selected].map((i) => (i >= at ? i + count : i)));
}
