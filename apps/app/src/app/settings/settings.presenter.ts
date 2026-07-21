// Settings presenter — Epic 13
// Spec: PRD-UI-SHELL.md §3 (the seam)

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BackupService,
  SettingsStore,
  type ThemeChoice,
} from '@achordeon/shared/data-access';
import { UiStore } from '../shared/layout';

/** How a restore ended, for the page to say so. */
export type RestoreOutcome = 'done' | 'failed';

/**
 * The only thing in this feature that knows the business layer exists.
 *
 * Signals in, commands out. When the designed UI lands, the components around it
 * are deleted and this file keeps working — it never knew what they looked like.
 */
@Injectable()
export class SettingsPresenter {
  private readonly store = inject(SettingsStore);
  /**
   * The shell's own preferences (PRD-UI-SHELL.md §7) — device-local and never
   * synced, unlike everything else on this page. The Settings page is where a
   * user looks for them regardless of which store owns them; that is exactly
   * the seam the presenter exists to hide.
   */
  private readonly ui = inject(UiStore);
  private readonly backups = inject(BackupService);

  readonly theme = this.store.theme;
  readonly language = this.store.language;
  readonly isSplitShared = this.ui.isSplitShared;

  private readonly _isBusy = signal(false);
  private readonly _restore = signal<RestoreOutcome | null>(null);
  /** A backup or restore is running — the buttons say so and stand down. */
  readonly isBusy = this._isBusy.asReadonly();
  /** The last restore's outcome, for the page's confirmation/error line. */
  readonly restoreOutcome = this._restore.asReadonly();

  /** Global is the base of the cascade, so it inherits from nothing (ADR-0006). */
  readonly globalValues = computed(
    () => this.store.global() as Record<string, unknown>,
  );

  setTheme(theme: ThemeChoice): void {
    this.store.setTheme(theme);
  }

  setSplitShared(isShared: boolean): void {
    // No current scope: the settings page has no splitter of its own to adopt a
    // ratio from, so linking falls back to the shared value already stored.
    this.ui.setSplitShared(isShared);
  }

  /** Dump the whole library to a file (#11). */
  async backup(): Promise<void> {
    this._isBusy.set(true);
    try {
      await this.backups.backup();
    } finally {
      this._isBusy.set(false);
    }
  }

  /**
   * Replace the whole library from a backup file, then reload.
   *
   * A full restore throws away what is here now, so the page confirms first —
   * this only runs once the user has said yes. The reload is deliberate: the
   * stores hold a window of the *old* data, and booting fresh against the
   * restored tables is cleaner than re-querying every one of them.
   */
  async restore(file: File): Promise<void> {
    this._isBusy.set(true);
    this._restore.set(null);
    try {
      await this.backups.restore(file);
      this._restore.set('done');
      location.reload();
    } catch {
      this._restore.set('failed');
    } finally {
      this._isBusy.set(false);
    }
  }

  dismissRestore(): void {
    this._restore.set(null);
  }

  patchGlobal(patch: Record<string, unknown>): void {
    // A sparse patch from the panel. At Global scope every setting is defined,
    // so an `undefined` (reset) has nothing to fall back to and is dropped.
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(defined).length > 0) {
      this.store.setGlobal(defined);
    }
  }
}
