// Where the songbook builder's view-state waits out an edit — UX ▸ songbook
// Spec: PRD-UI-SHELL.md §7 (the URL is a screen's state; this is the part of it
// that is not in the URL)

import { Injectable } from '@angular/core';

/**
 * The builder's transient view-state for **one** book — the ticks and the scroll
 * that the URL does not carry.
 *
 * Which book is open, which song's preview is up, the search and the sort: those
 * are in the address bar (§7), so returning to that URL restores them for free.
 * A multi-row selection and a scroll offset are not — they are a fact about the
 * list in front of you, held in the presenter, and the presenter dies when you
 * leave for the editor. This is the one drawer that survives that trip, so
 * pressing **Edit** in a preview and then **Close** in the editor lands you back
 * exactly where you were pointing.
 */
export interface SongbookView {
  /** The book this snapshot belongs to — restore is refused if it does not match
   * the book being loaded, so a stale snapshot never bleeds into another book. */
  readonly bookId: string;
  /** The library pane's ticked song ids. */
  readonly selectedIds: readonly string[];
  /** The entry pane's ticked slot keys. */
  readonly selectedSlots: readonly string[];
  /** The entry slot last clicked, which is not derivable from the current song. */
  readonly currentSlot: string | null;
  /** How far each list was scrolled, in px. */
  readonly libraryOffset: number;
  readonly entryOffset: number;
}

/**
 * A single-slot memory. There is only ever one book mid-edit, so one snapshot is
 * all this holds; capturing a second overwrites the first. Root-provided, because
 * it has to outlive the page that fills it — that is the whole reason it exists
 * rather than living on the presenter with everything else.
 *
 * **Not localStorage.** It is one navigation's memory, not a saved preference (the
 * same reasoning as `ReturnUrl`): a reload has no round-trip to restore and
 * should open the book clean.
 */
@Injectable({ providedIn: 'root' })
export class SongbookViewMemory {
  private snapshot: SongbookView | null = null;

  /** Stash the current view before leaving for the editor. */
  capture(view: SongbookView): void {
    this.snapshot = view;
  }

  /**
   * Take back the snapshot for `bookId`, if there is one — and **consume it**, so
   * the next plain open of the same book starts clean rather than re-applying a
   * selection the user has moved on from. Null when there is nothing to restore
   * or it belongs to another book.
   */
  take(bookId: string): SongbookView | null {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.bookId !== bookId) {
      return null;
    }
    this.snapshot = null;
    return snapshot;
  }
}
