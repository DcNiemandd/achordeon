// Language switching — Epic 11 ▸ i18n
// Spec: PRD-INFRASTRUCTURE.md §11 (i18n), §10 (routes keep working across it)

import { DOCUMENT, Injectable, LOCALE_ID, inject } from '@angular/core';
import { Router } from '@angular/router';

/** The UI languages (PRD §11). Mirrors `i18n.locales` in apps/app/project.json. */
export type Language = 'en' | 'cs';

/** The source locale — the one served from the base path, with no sub-path. */
const DEFAULT_LANGUAGE: Language = 'en';

/**
 * Written here, read by the pre-boot redirect in `index.html.template`. Keep the
 * key in step with that script (as `achordeon.theme` is kept in step with the
 * pre-paint theme stamp) — this is the only handshake between them.
 */
const STORAGE_KEY = 'achordeon.language';

/**
 * The current UI language, and the one act that changes it.
 *
 * Each locale is **its own build under its own sub-path** (`/achordeon/app/` and
 * `/achordeon/app/cs/`), which makes "switch language" a navigation rather than a
 * state change: `$localize` translates each message once, on first encounter, so
 * there is nothing to re-render — and reloading is the honest way to say so
 * (PRD §11 accepts exactly this).
 *
 * The route survives the switch. The in-app URL is carried across, so switching
 * language while looking at a song leaves you looking at the same song.
 */
@Injectable({ providedIn: 'root' })
export class Localization {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  /**
   * The language the running bundle was built for. `LOCALE_ID` comes from the
   * build's `--localize`, so this is a fact about the code that is executing, not
   * a preference that could disagree with it.
   */
  readonly current: Language = normalize(inject(LOCALE_ID));

  /**
   * Persist the choice and go to that locale's build.
   *
   * The write comes first and matters more than the navigation: the redirect
   * script reads it on every subsequent load, so a bookmark to the English URL
   * still opens in Czech. Choosing the language you are already in is a no-op —
   * the preference is stored (it may have been implicit until now) and no reload
   * is spent on it.
   */
  switchTo(language: Language): void {
    this.remember(language);
    if (language === this.current) return;
    this.document.defaultView?.location.assign(this.urlFor(language));
  }

  /**
   * The absolute path of the current route under `language`'s build.
   *
   * Derived from `<base href>` rather than a hard-coded deploy path: the base is
   * `/achordeon/app/` or `/achordeon/app/cs/` depending on which build is running,
   * so stripping the current locale segment off it leaves the app root wherever
   * the app happens to be deployed.
   */
  private urlFor(language: Language): string {
    const base = new URL(this.document.baseURI);
    const suffix = `${this.current}/`;
    const root =
      this.current === DEFAULT_LANGUAGE || !base.pathname.endsWith(suffix)
        ? base.pathname
        : base.pathname.slice(0, -suffix.length);
    const prefix = language === DEFAULT_LANGUAGE ? '' : `${language}/`;
    // `router.url` starts with '/', and `root` ends with one.
    return `${root}${prefix}${this.router.url.slice(1)}`;
  }

  private remember(language: Language): void {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Private mode or quota. The switch itself still happens; only its
      // stickiness across a cold start is lost.
    }
  }
}

/** An unknown or region-tagged locale (`cs-CZ`) resolves to a language we have. */
function normalize(locale: string): Language {
  return locale.slice(0, 2).toLowerCase() === 'cs' ? 'cs' : DEFAULT_LANGUAGE;
}
