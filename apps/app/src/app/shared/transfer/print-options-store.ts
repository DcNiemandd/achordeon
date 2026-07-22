// Print options store — Epic 7 follow-up (#3)
// Spec: PRD-UI-SHELL.md §7 (device-local UI preference, never synced)
//
// The songbook PDF dialog's last answer, kept so the next download starts where
// the last one left off — a person who prints A4 landscape with a summary wants
// that again, not the defaults every time.
//
// `localStorage` like `UiStore`, and for the same reasons: it is a chrome
// preference, not library data, so it must not sync, and it is small. It is not
// on the boot path, so the sync-read argument does not apply — but sharing the
// mechanism keeps one pattern for "a bit of UI state that outlives the tab".

import { Injectable, signal } from '@angular/core';
import type { SongbookPdfChoice } from './transfer-model';

const KEY = 'achordeon.print';

export const DEFAULT_PRINT_OPTIONS: SongbookPdfChoice = {
  format: 'pdf',
  pageSize: 'A4',
  isLandscape: false,
  marginMm: 10,
  hasTitlePage: true,
  titlePageVariant: 'classic',
  hasSummary: false,
  hasPageNumbers: true,
  pageNumberPosition: 'bottom-center',
  // All songs prints by title (the heading a reader flips to find) by default.
  songOrder: { axis: 'title', dir: 'asc', favoritesFirst: false },
};

@Injectable({ providedIn: 'root' })
export class PrintOptionsStore {
  private readonly _options = signal<SongbookPdfChoice>(DEFAULT_PRINT_OPTIONS);

  /** The last-used print options, for the dialog to open on. */
  readonly options = this._options.asReadonly();

  constructor() {
    this.hydrate();
  }

  /** Remember this answer for next time. Called when a download is confirmed. */
  save(options: SongbookPdfChoice): void {
    this._options.set(options);
    try {
      localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
      // Private mode or quota — a remembered print choice is not worth a throw.
    }
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<SongbookPdfChoice>;
      // Merge over the defaults so a value stored before a field existed (a new
      // option in a later build) still opens with that field at its default,
      // rather than `undefined` reaching the renderer.
      this._options.set({ ...DEFAULT_PRINT_OPTIONS, ...stored });
    } catch {
      // Fall back to defaults — see save().
    }
  }
}
