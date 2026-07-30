// Device print options store — Epic 7 follow-up (#3)
// Spec: PRD-UI-SHELL.md §7 (device-local UI preference, never synced)
//
// The **device-bound** half of the songbook download dialog — format, page size,
// orientation, margin, and the All songs order — kept so the next download starts
// on the paper the last one used: a person who prints A4 landscape wants that
// again, not the defaults every time.
//
// Device-local on purpose. "A4 at home, Letter at the office" is a fact about the
// printer in front of you, not about the book, so it must not sync — the OTHER
// half of the dialog, the book's own structure (title page, summary, page
// numbers), lives on the record and travels with the book (`SongbookPrint`).
//
// `localStorage` like `UiStore`, and for the same reasons: a chrome preference,
// small, not on the boot path. Sharing the mechanism keeps one pattern for "a bit
// of UI state that outlives the tab".

import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_SONGBOOK_PRINT,
  resolveSongbookPrint,
  type SongbookPrint,
} from '@achordeon/shared/domain';
import {
  DEFAULT_DEVICE_PRINT_OPTIONS,
  type DevicePrintOptions,
} from './transfer-model';

const KEY = 'achordeon.print';

/**
 * Where the **virtual All songs** book keeps its print structure.
 *
 * Every real book carries its own `SongbookPrint` on its record and syncs it; All
 * songs has no record, so its title page / summary / page-number choices have
 * nowhere on a book to live. They land here instead — device-local, like the
 * paper, which is the honest home for "the settings of a book that is not a
 * record". A separate key from the paper so the two evolve apart.
 */
const ALL_SONGS_PRINT_KEY = 'achordeon.allSongsPrint';

@Injectable({ providedIn: 'root' })
export class PrintOptionsStore {
  private readonly _options = signal<DevicePrintOptions>(
    DEFAULT_DEVICE_PRINT_OPTIONS,
  );

  /** The last-used device paper, for the dialog to open on. */
  readonly options = this._options.asReadonly();

  private readonly _allSongsPrint = signal<SongbookPrint>(
    DEFAULT_SONGBOOK_PRINT,
  );

  /** The virtual All songs book's print structure — its settings dialog reads
   * and writes this, and its preview and download draw from it. */
  readonly allSongsPrint = this._allSongsPrint.asReadonly();

  constructor() {
    this.hydrate();
  }

  /** Remember this paper for next time. Called when a download is confirmed. */
  save(options: DevicePrintOptions): void {
    this._options.set(options);
    try {
      localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
      // Private mode or quota — a remembered print choice is not worth a throw.
    }
  }

  /** Write the All songs print structure from its settings dialog. */
  saveAllSongsPrint(print: SongbookPrint): void {
    this._allSongsPrint.set(print);
    try {
      localStorage.setItem(ALL_SONGS_PRINT_KEY, JSON.stringify(print));
    } catch {
      // Private mode or quota — see save().
    }
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<DevicePrintOptions>;
      // Pick only the device keys off whatever is stored: a value written before
      // the book-bound half moved to the record still carries those extra fields,
      // and they must not ride back into a `DevicePrintOptions`. Merge over the
      // defaults so a field added later still opens at its default rather than
      // `undefined`.
      this._options.set({
        ...DEFAULT_DEVICE_PRINT_OPTIONS,
        format: stored.format ?? DEFAULT_DEVICE_PRINT_OPTIONS.format,
        pageSize: stored.pageSize ?? DEFAULT_DEVICE_PRINT_OPTIONS.pageSize,
        isLandscape:
          stored.isLandscape ?? DEFAULT_DEVICE_PRINT_OPTIONS.isLandscape,
        marginMm: stored.marginMm ?? DEFAULT_DEVICE_PRINT_OPTIONS.marginMm,
        songOrder: stored.songOrder ?? DEFAULT_DEVICE_PRINT_OPTIONS.songOrder,
      });
    } catch {
      // Fall back to defaults — see save().
    }

    try {
      const raw = localStorage.getItem(ALL_SONGS_PRINT_KEY);
      if (raw) {
        // Merge over the defaults so a field added in a later build opens at its
        // default rather than `undefined` reaching the renderer.
        this._allSongsPrint.set(
          resolveSongbookPrint(JSON.parse(raw) as Partial<SongbookPrint>),
        );
      }
    } catch {
      // Fall back to defaults.
    }
  }
}
