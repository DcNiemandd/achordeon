// Stage presenter — Epic 8 ▸ songbook picker
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SongStore, SongbookStore } from '@achordeon/shared/data-access';
import { ALL_SONGS_ID } from '@achordeon/shared/domain';

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
  private readonly router = inject(Router);

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
    if (!this.books.loaded()) {
      await this.books.load();
    }
    this._librarySize.set((await this.songs.allLive()).length);
  }

  perform(id: string): void {
    void this.router.navigate(['/stage', id]);
  }
}
