// Stage presenter — Epic 8 ▸ songbook picker
// Spec: docs/achordeon-implementation.md §Epic 8

import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SongbookStore } from '@achordeon/shared/data-access';

export interface SongbookPickerRow {
  readonly id: string;
  readonly name: string;
  readonly entryCount: number;
}

/**
 * Provides the songbook list for the Stage picker.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3). This presenter knows the
 * business layer; the page knows only what the presenter exposes.
 *
 * The virtual **All songs** book is excluded: performing requires a fixed,
 * ordered entry list, which only a real songbook has. An empty book is shown
 * but cannot be performed (the button is disabled).
 */
@Injectable()
export class StagePresenter {
  private readonly books = inject(SongbookStore);
  private readonly router = inject(Router);

  readonly rows = computed<SongbookPickerRow[]>(() =>
    this.books.live().map((book) => ({
      id: book.id,
      name: book.name,
      entryCount: book.entries.length,
    })),
  );

  readonly isEmpty = computed(() => this.books.live().length === 0);

  async load(): Promise<void> {
    if (!this.books.loaded()) {
      await this.books.load();
    }
  }

  perform(id: string): void {
    void this.router.navigate(['/stage', id]);
  }
}
