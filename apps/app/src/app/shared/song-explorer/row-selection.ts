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
 */
export class RowSelection {
  private readonly _ids = signal<ReadonlySet<string>>(new Set());

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
  }

  /** Drop a row that no longer exists — a tombstone must not stay selected, or
   * the next bulk action operates on it. */
  deselect(id: string): void {
    this._ids.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  clear(): void {
    this._ids.set(new Set());
  }
}
