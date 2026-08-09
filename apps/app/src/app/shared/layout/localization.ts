// Language switching — Epic 11 ▸ i18n
// Spec: PRD-INFRASTRUCTURE.md §11 (runtime `@angular/localize`, one bundle)

import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { WarnUnsynced } from './warn-unsynced';

/** The UI languages (PRD §11). A new one needs a catalog in `src/locale` — see
 * `tools/check-locales.mjs`, which fails the build if the two disagree. */
export const LANGUAGES = ['en', 'cs'] as const;

export type Language = (typeof LANGUAGES)[number];

/** The language the messages are authored in — it needs no catalog, because
 * `$localize` falls back to the source text compiled into the bundle. */
export const SOURCE_LANGUAGE: Language = 'en';

/**
 * Written here, read by `main.ts` before Angular exists. `localStorage` because
 * the choice has to be readable **synchronously at boot** — the catalog is fetched
 * before the first render, so there is no time to wait for IndexedDB, and the
 * chosen language is not a setting that may arrive late.
 */
const STORAGE_KEY = 'achordeon.language';

/**
 * The language to boot in: the explicit choice if there is one, otherwise the
 * browser's, otherwise the source language.
 *
 * A stored value always wins — that is what makes the Settings control stick —
 * and auto-detection is only ever the fallback, so it needs no "first visit"
 * bookkeeping: once a user has chosen, there is nothing left to detect.
 *
 * Called from `main.ts`, before the injector exists, which is why it is a plain
 * function and not a method on the service below.
 */
export function chosenLanguage(): Language {
  const stored = read();
  if (stored !== null) return stored;
  const browser = (navigator.language || SOURCE_LANGUAGE)
    .slice(0, 2)
    .toLowerCase();
  return isLanguage(browser) ? browser : SOURCE_LANGUAGE;
}

/**
 * The current UI language, and the one act that changes it.
 *
 * **Switching reloads.** Runtime `$localize` translates each message the first
 * time it is encountered and caches it, so a language change cannot be re-rendered
 * into an app that is already running — PRD §11 decided the reload, and this is
 * where it happens. The URL is untouched, so the reload lands on the same screen.
 */
@Injectable({ providedIn: 'root' })
export class Localization {
  private readonly unload = inject(WarnUnsynced);

  /**
   * The language the running app was booted with. `LOCALE_ID` is provided in
   * `main.ts` from the catalog it actually loaded, so this cannot drift from what
   * is on screen — which a preference read from storage could.
   */
  readonly current: Language = normalize(inject(LOCALE_ID));

  /**
   * Persist the choice and reload into it.
   *
   * The write comes first and matters more than the reload: `main.ts` reads it on
   * every boot. Choosing the language already running is a no-op beyond recording
   * it — it may have been an auto-detected guess until now, and a guess that has
   * been confirmed should stop being a guess.
   *
   * Through `WarnUnsynced` rather than `location.reload()` directly: this reload
   * is the app's, so the leave-warning must not fire. A user who picks a language
   * and is asked whether they really want to leave has been asked about something
   * they did not do.
   */
  switchTo(language: Language): void {
    write(language);
    if (language === this.current) return;
    this.unload.reload();
  }
}

/**
 * A page of the published docs, in the language the app is showing.
 *
 * Derived from the app's own base href rather than written out: the deploy puts
 * the docs site at the root and the app one level under it (`/app/`, see
 * `.github/workflows/deploy.yml`), so `../` is the docs root wherever the bundle
 * is served from — the apex domain, a project page, a fork. Nothing to re-point
 * when the domain changes. Non-source languages live under their own prefix,
 * which is Docusaurus's i18n layout, not ours.
 *
 * `page` is a route under `docs/` (`privacy`, `patch-notes`), or `''` for the docs
 * root, which is the intro page itself. Empty is joined without a separator on
 * purpose: the docs are built with `trailingSlash: false`, so the deploy writes
 * `docs.html` and no `docs/index.html` — GitHub Pages answers `/docs` with the
 * page and `/docs/` with a 404. A dev server hides that, since its router matches
 * either form.
 *
 * In `nx serve` this resolves to the dev server, where the docs are not (they run
 * separately, `nx serve docs`), so every link built from it is a production
 * affordance.
 */
export function docsPageUrl(language: Language, page: string): string {
  const root = language === SOURCE_LANGUAGE ? 'docs' : `${language}/docs`;
  const path = page === '' ? root : `${root}/${page}`;
  return new URL(path, new URL('../', document.baseURI)).href;
}

function read(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // Private mode, or storage blocked. The browser's language decides instead.
    return null;
  }
}

function write(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The switch still happens; only its stickiness across a cold start is lost.
  }
}

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

/** A region-tagged (`cs-CZ`) or unknown locale resolves to a language we have. */
function normalize(locale: string): Language {
  const language = locale.slice(0, 2).toLowerCase();
  return isLanguage(language) ? language : SOURCE_LANGUAGE;
}
