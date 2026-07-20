// Settings presenter — Epic 13
// Spec: PRD-UI-SHELL.md §3 (the seam)

import { Injectable, computed, inject } from '@angular/core';
import { SettingsStore, type ThemeChoice } from '@achordeon/shared/data-access';
import { UiStore } from '../shared/layout';

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

  readonly theme = this.store.theme;
  readonly language = this.store.language;
  readonly isSplitShared = this.ui.isSplitShared;

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
