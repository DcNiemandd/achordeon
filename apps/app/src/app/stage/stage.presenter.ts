// Stage presenter — Epic 8 ▸ songbook picker
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SettingsStore,
  SongStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import { ALL_SONGS_ID, type AllSongsOrder } from '@achordeon/shared/domain';
import { StageSession } from '../shared/layout';

export interface SongbookPickerRow {
  readonly id: string;
  readonly name: string;
  readonly entryCount: number;
  /** True for the virtual All songs book (shown first, always). */
  readonly isAllSongs: boolean;
}

/**
 * Provides the songbook list for the Stage picker.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3).
 *
 * Empty songbooks are hidden (not disabled) — performing nothing is not a
 * useful option, and a grayed-out row trains the user to click it anyway.
 * A note below the list reports how many are hidden.
 *
 * All songs is always listed first: it is the full library and the obvious
 * default choice for an impromptu performance.
 */
@Injectable()
export class StagePresenter {
  private readonly books = inject(SongbookStore);
  private readonly songs = inject(SongStore);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);
  private readonly session = inject(StageSession);

  private readonly _librarySize = signal(0);

  readonly rows = computed<SongbookPickerRow[]>(() => {
    const allSongsRow: SongbookPickerRow = {
      id: ALL_SONGS_ID,
      name: $localize`:@@songbooks.allSongs:All songs`,
      entryCount: this._librarySize(),
      isAllSongs: true,
    };
    const real = this.books
      .live()
      .filter((b) => b.entries.length > 0)
      .map((b) => ({
        id: b.id,
        name: b.name,
        entryCount: b.entries.length,
        isAllSongs: false,
      }));
    return [allSongsRow, ...real];
  });

  /** Number of real songbooks hidden because they are empty. */
  readonly hiddenCount = computed(
    () => this.books.live().filter((b) => b.entries.length === 0).length,
  );

  readonly isEmpty = computed(() =>
    this.rows().every((r) => r.isAllSongs && r.entryCount === 0),
  );

  async load(): Promise<void> {
    // Returning to the Stage module while a performance is open reopens it — the
    // picker is for choosing what to perform, not for interrupting a performance
    // already in progress.
    const activeBook = this.session.bookId();
    if (activeBook !== null) {
      void this.router.navigate(['/stage', activeBook]);
      return;
    }

    if (!this.books.loaded()) {
      await this.books.load();
    }
    this._librarySize.set((await this.songs.allLive()).length);
  }

  // --- the All songs order ------------------------------------------------------
  //
  // The picker is where this belongs: All songs is the one row whose order is a
  // question rather than an arrangement, and the setlist is the only place the
  // answer shows. Asking it here means the control sits beside the row it orders,
  // one press before the performance it changes.

  private readonly _isOrderOpen = signal(false);
  readonly isOrderOpen = this._isOrderOpen.asReadonly();

  /** The saved order — what the dialog opens on, and what `open()` performs in. */
  readonly allSongsOrder = this.settings.allSongsOrder;

  /** The gear on the All songs row. Other rows do not carry it: a stored book's
   * order is its slots, and those are arranged in the Songbooks module. */
  openOrder(id: string): void {
    if (id === ALL_SONGS_ID) {
      this._isOrderOpen.set(true);
    }
  }

  closeOrder(): void {
    this._isOrderOpen.set(false);
  }

  /**
   * Save the order and close.
   *
   * Nothing here has to be told: the picker shows names and counts, not songs, and
   * the setlist is built when a performance starts. The write reaches the account's
   * other devices like any other synced edit.
   */
  async saveOrder(order: AllSongsOrder): Promise<void> {
    await this.settings.setAllSongsOrder(order);
    this._isOrderOpen.set(false);
  }

  /** Fetch the next page of songbooks; a no-op once the window is exhausted. */
  loadMore(): void {
    void this.books.loadMore();
  }

  perform(id: string): void {
    void this.router.navigate(['/stage', id]);
  }
}
