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
  DEFAULT_DEVICE_PRINT_OPTIONS,
  type DevicePrintOptions,
} from './transfer-model';

const KEY = 'achordeon.print';

@Injectable({ providedIn: 'root' })
export class PrintOptionsStore {
  private readonly _options = signal<DevicePrintOptions>(
    DEFAULT_DEVICE_PRINT_OPTIONS,
  );

  /** The last-used device paper, for the dialog to open on. */
  readonly options = this._options.asReadonly();

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
  }
}
