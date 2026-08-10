// Row selection — Epic 6 (correction)
// Spec: CONTEXT.md §Song explorer

import { computed, signal } from '@angular/core';

/**
 * Which rows of one list are picked, and the two gestures that change it.
 *
 * **Owned by the presenter that mounts the list, never by a store.** It used to
 * live in `SessionStore`, which made it one set for the whole app: picking three
 * songs in the library and then walking into a songbook arrived with three songs
 * already ticked — rows chosen in a different module, for a different purpose,
 * now armed against a different set of buttons. A selection is a fact about a
 * list on a screen, so it lives and dies with that screen (PRD-UI-SHELL.md §7).
 *
 * The two gestures are deliberately different, because "which song am I looking
 * at" and "which songs am I about to act on" are different questions:
 *
 * - **the row** — `selectOnly`: this one, and nothing else. Clicking a song and
 *   then pressing Add put nothing anywhere, because looking at a row had never
 *   selected it; the checkbox was the only way in and you had to know that.
 * - **the checkbox** — `toggle`: add this one to what is already picked. The
 *   gesture that builds a multi-selection, and the only one that can.
 * - **shift and the checkbox** — `extendTo`: everything from the last row picked
 *   to this one. Ticking forty songs one at a time is not a gesture.
 */
export class RowSelection {
  private readonly _ids = signal<ReadonlySet<string>>(new Set());

  /**
   * The row a range would reach back to — whichever one a single-row gesture
   * last named, whether that gesture ticked it or unticked it.
   *
   * A **separate fact from the set**: "the last row I picked" cannot be read off
   * an unordered set of ids, and the obvious substitutes are both wrong — the
   * only member of a selection of one says nothing once there are two, and the
   * current row is what you are *looking at*, which a tick never changes.
   */
  private readonly _anchor = signal<string | null>(null);

  readonly ids = this._ids.asReadonly();
  readonly count = computed(() => this._ids().size);
  readonly isEmpty = computed(() => this._ids().size === 0);

  has(id: string): boolean {
    return this._ids().has(id);
  }

  /** The checkbox: add to (or drop from) the current selection. */
  toggle(id: string): void {
    this._ids.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
    this._anchor.set(id);
  }

  /**
   * Shift and the checkbox: **tick everything from the anchor to this row**, in
   * the order the list is currently drawn in — which is why the order has to be
   * passed in. A selection knows which rows are picked; only the list that drew
   * them knows what lies between two of them, and the same songs sort differently
   * in the library than they sit in a songbook.
   *
   * It only ever **adds**. A range that replaced the selection would throw away
   * whatever was ticked elsewhere in the list, which is exactly what someone
   * reaching for Shift after ticking a few rows by hand is trying to keep.
   *
   * The anchor stays where it was, so a second shift-click re-draws the range
   * from the same row rather than from the end of the last one — press twice by
   * mistake and you have the range you meant, not two of them.
   *
   * With no anchor, or an anchor that is no longer in this list (a search has
   * been typed since), there is no range to speak of and this is a plain tick.
   */
  extendTo(id: string, order: readonly string[]): void {
    const anchor = this._anchor();
    const from = anchor === null ? -1 : order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from === -1 || to === -1) {
      this.toggle(id);
      return;
    }

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    this._ids.update((ids) => {
      const next = new Set(ids);
      for (let at = start; at <= end; at++) {
        next.add(order[at]);
      }
      return next;
    });
  }

  /**
   * The row: replace the selection with this one row — **or clear it, if this
   * row was already the whole selection.**
   *
   * Without the second half there is no way back to *nothing selected* once you
   * have clicked a row: the checkbox is the only escape, and the songbook list
   * has no checkboxes at all. A gesture that can only ever be applied is not a
   * gesture, it is a latch. Clicking the row again is the obvious undo, and it
   * is the one every file manager already taught.
   *
   * It clears the **selection**, not "which song am I looking at" — those are
   * different facts wearing different marks (see the explorer's `is-selected`
   * against `is-current`), and the render pane must not blank because you
   * untinted a row.
   */
  selectOnly(id: string): void {
    const current = this._ids();
    const isOnlyThis = current.size === 1 && current.has(id);
    this._ids.set(isOnlyThis ? new Set() : new Set([id]));
    // Still the anchor even when the click emptied the selection: "the last row
    // I named" is what a range reaches back to, and clicking a row named it.
    this._anchor.set(id);
  }

  /** Drop a row that no longer exists — a tombstone must not stay selected, or
   * the next bulk action operates on it. */
  deselect(id: string): void {
    this._ids.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
    // A row that has gone cannot be a range's far end either.
    if (this._anchor() === id) {
      this._anchor.set(null);
    }
  }

  clear(): void {
    this._ids.set(new Set());
    this._anchor.set(null);
  }

  /**
   * Replace the whole selection with a given set — for **restoring** one that was
   * captured before the screen was left, not for any user gesture (those go
   * through `toggle`/`selectOnly`). Copied in, so the caller's set cannot mutate
   * the signal's value behind its back.
   *
   * No anchor comes back with it: what was restored is a set of ticks, and which
   * of them was pressed last was never part of what was captured.
   */
  set(ids: Iterable<string>): void {
    this._ids.set(new Set(ids));
    this._anchor.set(null);
  }
}
