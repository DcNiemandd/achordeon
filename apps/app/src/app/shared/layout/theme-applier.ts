// Theme applier — Epic 13
// Spec: PRD-UI-SHELL.md §6

import {
  DOCUMENT,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

/** Matches SettingsStore's ThemeChoice without importing data-access (§3). */
export type Theme = 'system' | 'light' | 'dark';

/** Read by the pre-paint script in index.html.template — keep both in step. */
const PRE_PAINT_KEY = 'achordeon.theme';

/** The same query `_tokens.scss` keys its `system` dark values off. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

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

  /** The last theme applied — the CHOICE, which for `system` is not yet an answer. */
  private readonly choice = signal<Theme>('system');
  /**
   * What the OS says, kept live.
   *
   * A signal and not a one-off read, because `system` has no fixed answer: a
   * reader who flips their machine to dark at dusk expects the app to follow
   * without a reload, and `isDark` below is only honest if this is.
   */
  private readonly prefersDark = signal(false);

  /**
   * Is the app dark **right now** — the choice resolved against the OS.
   *
   * The one thing that can answer "is this a dark room" without asking the DOM
   * what colour it went. It exists for the dark page: `UiStore.followTheme` reads
   * it so a song can be turned over with the desk it is lying on (Settings ▸
   * Application ▸ Dark page). Everything else still gets its dark from CSS.
   */
  readonly isDark = computed(
    () =>
      this.choice() === 'dark' ||
      (this.choice() === 'system' && this.prefersDark()),
  );

  constructor() {
    // Absent in a document that is not a browser window (and in some test
    // environments). No answer from the OS reads as light, which is what the
    // token sheet falls back to as well.
    const query = this.document.defaultView?.matchMedia?.(DARK_QUERY);
    if (!query) return;
    this.prefersDark.set(query.matches);
    query.addEventListener('change', (event) =>
      this.prefersDark.set(event.matches),
    );
  }

  /** Starts mirroring `theme()` onto the document element. */
  connect(theme: () => Theme): void {
    effect(() => this.apply(theme()));
  }

  /**
   * The last theme this device chose, or `null` if it never did.
   *
   * The root shell seeds `SettingsStore` from this at boot, and without it the
   * cache below would be write-only: the pre-paint script stamped `dark`, the
   * store came up at its `'system'` default, and the first `connect` effect
   * promptly *removed* the attribute the script had just set. A chosen dark theme
   * survived exactly until Angular booted.
   */
  cached(): Theme | null {
    try {
      const stored = localStorage.getItem(PRE_PAINT_KEY);
      return stored === 'dark' || stored === 'light' || stored === 'system'
        ? stored
        : null;
    } catch {
      return null;
    }
  }

  apply(theme: Theme): void {
    this.choice.set(theme);
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
