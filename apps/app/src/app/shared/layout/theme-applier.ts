// Theme applier — Epic 13
// Spec: PRD-UI-SHELL.md §6

import { DOCUMENT, Injectable, effect, inject } from '@angular/core';

/** Matches SettingsStore's ThemeChoice without importing data-access (§3). */
export type Theme = 'system' | 'light' | 'dark';

/** Read by the pre-paint script in index.html.template — keep both in step. */
const PRE_PAINT_KEY = 'achordeon.theme';

/**
 * Mirrors the chosen theme onto `<html data-theme>`.
 *
 * This is the **only** line of code connecting theme state to the DOM. Everything
 * else falls out of CSS: `_tokens.scss` keys its dark values off `[data-theme]`
 * plus `prefers-color-scheme`, and `color-scheme` (set alongside) makes native
 * form controls and scrollbars follow for free.
 *
 * It takes the theme as a **plain accessor rather than injecting SettingsStore**,
 * so this stays in `app/shared` under the import ladder (§3) and stays trivially
 * testable. The shell wires it to the real store.
 *
 * The pre-paint script in `index.html.template` stamps the same attribute before
 * Angular boots — without it a dark-mode user gets a white flash, since the app
 * bootstraps after first paint.
 */
@Injectable({ providedIn: 'root' })
export class ThemeApplier {
  private readonly document = inject(DOCUMENT);

  /** Starts mirroring `theme()` onto the document element. */
  connect(theme: () => Theme): void {
    effect(() => this.apply(theme()));
  }

  apply(theme: Theme): void {
    const root = this.document.documentElement;
    if (theme === 'system') {
      // Remove rather than set: the token sheet's default :root already means
      // "follow prefers-color-scheme", and a [data-theme] would override it.
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    this.cacheForPrePaint(theme);
  }

  /**
   * Mirror the choice into `localStorage` for the pre-paint script.
   *
   * The **source of truth is the User record** (SettingsStore, IndexedDB, and it
   * syncs). This is only a cache, and it exists because the pre-paint script has
   * to run before first paint and IndexedDB cannot be read synchronously. A stale
   * value costs one frame of the wrong theme, never a wrong setting.
   */
  private cacheForPrePaint(theme: Theme): void {
    try {
      localStorage.setItem(PRE_PAINT_KEY, theme);
    } catch {
      // Private mode or quota. The app still themes correctly once booted; the
      // only loss is the flash this cache exists to prevent.
    }
  }
}
