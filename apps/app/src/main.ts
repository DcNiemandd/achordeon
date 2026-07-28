// Boot — Epic 11 ▸ i18n (PRD-INFRASTRUCTURE.md §11: runtime `@angular/localize`)
//
// One bundle for every language. `$localize` stays in the shipped code and the
// translations arrive as data, which is why this file has work to do before
// `bootstrapApplication`: a message is translated the **first time it is
// encountered**, so a catalog that lands after the first render leaves whatever
// rendered in English for good. The await is the whole design.
//
// English costs nothing — it is the source text already in the bundle, so there
// is no catalog to fetch and no locale data to register. Only a non-source
// language pays, and it pays once.

import { LOCALE_ID } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { loadTranslations } from '@angular/localize';
// **Straight at the file, not through the `shared/layout` barrel** — and the app
// itself is not imported here at all. See `boot`: a static import of either would
// run the whole shell's module bodies before this one's, and `$localize` at module
// scope translates then. The barrel is the trap, because importing one name from it
// evaluates every module it re-exports.
import {
  SOURCE_LANGUAGE,
  chosenLanguage,
  type Language,
} from './app/shared/layout/localization';

async function boot(): Promise<void> {
  const language = chosenLanguage();
  if (language !== SOURCE_LANGUAGE) {
    await translate(language);
  }

  // `<html lang>` is not decoration: it tells a screen reader which voice to use
  // and the browser which hyphenation and quote rules apply. The template ships
  // `lang="en"`, so anything else has to be stamped here.
  document.documentElement.lang = language;

  // **Imported here, dynamically, and not at the top of the file.**
  //
  // A static import is evaluated before the importing module's own body runs, so
  // `import { App } from './app/app'` would execute every module in the shell's
  // graph *before* `boot` was ever called — and any `$localize` at module scope
  // (rather than inside a class) is translated at exactly that moment, against a
  // catalog that has not been loaded yet. The result is a message frozen in
  // English for the life of the page, whatever the user chose.
  //
  // That is not hypothetical: the nav labels are a module-level `const` array, and
  // they were the one thing on a Czech screen still reading "Songs". Awaiting the
  // import here is what puts the catalog first.
  const [{ appConfig }, { App }] = await Promise.all([
    import('./app/app.config'),
    import('./app/app'),
  ]);

  await bootstrapApplication(App, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      // Nothing sets this for us any more (the per-locale build used to). Angular's
      // locale-aware formatting reads it, and `Localization` reports it as the
      // language that is actually running.
      { provide: LOCALE_ID, useValue: language },
    ],
  });
}

/**
 * Load `language`'s catalog and its locale data.
 *
 * A failure here is deliberately **not** fatal: an English app is a working app,
 * and refusing to boot because a 24 kB JSON file did not arrive would turn a
 * cosmetic problem into a broken one. The service worker precaches the catalogs,
 * so offline is not the failure case — a bad deploy is.
 *
 * The locale data is imported dynamically so it lands in its own chunk: only a
 * Czech user downloads Czech date and number rules. It matters even though no
 * pipe formats a date today — `LOCALE_ID: 'cs'` with no registered data makes the
 * first `DatePipe` throw, and it would throw for Czech users only.
 */
async function translate(language: Language): Promise<void> {
  try {
    const [catalog] = await Promise.all([
      fetchCatalog(language),
      registerLocale(language),
    ]);
    // A catalog under translation carries `null` for what nobody has written yet
    // (see tools/sync-locales.mjs). Those are dropped rather than loaded: an
    // absent key falls back to the English source text, which is the whole reason
    // a half-finished language is safe to ship, while a `null` handed to
    // `loadTranslations` would be a message that renders as nothing.
    loadTranslations(
      Object.fromEntries(
        Object.entries(catalog.translations).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
    );
  } catch (error) {
    console.error(`Could not load the ${language} translations.`, error);
  }
}

/** A language's catalog. `null` marks a message nobody has translated yet.
 * Resolved against `<base href>`, so it is found under the deploy sub-path as
 * readily as at a domain root. */
async function fetchCatalog(
  language: Language,
): Promise<{ translations: Record<string, string | null> }> {
  const response = await fetch(
    new URL(`locale/${language}.json`, document.baseURI),
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<{
    translations: Record<string, string | null>;
  }>;
}

/** Angular's locale data for `language`, registered. One `case` per language, so
 * the bundler can see each import and split it — a computed path cannot be. */
async function registerLocale(language: Language): Promise<void> {
  const { registerLocaleData } = await import('@angular/common');
  switch (language) {
    case 'cs': {
      const { default: data } = await import('@angular/common/locales/cs');
      registerLocaleData(data);
      return;
    }
    default:
      return;
  }
}

void boot();
