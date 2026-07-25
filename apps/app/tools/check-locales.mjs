// The i18n gate. Fails the build; silent in dev. Epic 11 ▸ i18n.
//
// **This is `i18nMissingTranslation: "error"`, rebuilt.** That option belongs to
// compile-time *inlining*: the CLI can only complain about a missing translation
// while it is substituting one into a bundle. Runtime `@angular/localize`
// (PRD-INFRASTRUCTURE.md §11) never inlines anything — `loadTranslations` hands
// `$localize` a map at boot and a missing key silently falls back to the English
// source text, which looks like a working app and reaches production unnoticed.
// So the check moves here, to a build step, and gets stricter while it is at it.
//
// Four ways the catalogs can be wrong, all of them build failures:
//
//   1. **stale source catalog** — a `$localize`/`i18n=` id in the code that
//      `messages.json` has never seen. Nothing downstream can be trusted until
//      `nx run app:sync-locales` has run;
//   2. **missing translation** — a message with no translation in a catalog;
//   3. **needs re-checking** — the English changed under an existing translation
//      (`stale`, written by `sync-locales.mjs`);
//   4. **unknown language** — a catalog with no matching entry in LANGUAGES, or a
//      language in LANGUAGES with no catalog. Either way one of them is a lie, and
//      the app would offer a language it cannot load (or hide one it can).
//
// Wired to `build`, not to `serve`, so it fails a production build and never
// interrupts the dev loop (`serve` runs its own build in-process, so a target's
// `dependsOn` does not reach it). A locale can opt out while it is being written
// by declaring `"draft": true` in its own catalog — the count is still reported.
// Deleting that one line is what turns the language on for good.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const LOCALE_DIR = resolve(projectRoot, 'src/locale');
const SOURCE_FILE = 'messages.json';

/** How many offenders to name before saying "and N more". */
const SHOWN = 12;

function main() {
  const problems = [];
  const source = readCatalog(SOURCE_FILE).translations;
  const ids = new Set(Object.keys(source));

  // 1. The source catalog against the code that produced it.
  const uncollected = [...idsInCode()].filter((id) => !ids.has(id));
  if (uncollected.length > 0) {
    problems.push(
      report(
        `${uncollected.length} message(s) in the code are not in ${SOURCE_FILE}`,
        uncollected,
        'Run `nx run app:sync-locales` and translate what it adds.',
      ),
    );
  }

  // 4a. Every language the app offers must have a catalog to load.
  const catalogs = catalogFiles();
  const declared = languagesInCode();
  const source_ = sourceLanguageInCode();
  for (const language of declared) {
    if (language === source_) continue; // the source needs no catalog
    if (!catalogs.includes(`${language}.json`)) {
      problems.push(
        report(
          `LANGUAGES offers '${language}' but src/locale/${language}.json does not exist`,
          [],
          'Add the catalog, or drop the language from LANGUAGES.',
        ),
      );
    }
  }

  for (const file of catalogs) {
    const language = file.replace(/\.json$/, '');
    const catalog = readCatalog(file);

    // 4b. …and every catalog must belong to a language the app offers.
    if (!declared.includes(language)) {
      problems.push(
        report(
          `src/locale/${file} is not a language the app offers`,
          [],
          `Add '${language}' to LANGUAGES in app/shared/layout/localization.ts, or delete the catalog.`,
        ),
      );
    }

    // 2 + 3.
    const translations = catalog.translations ?? {};
    const missing = [...ids].filter((id) => !translations[id]);
    const stale = (catalog.stale ?? []).filter((id) => ids.has(id));
    const draft = catalog.draft === true;
    const summary =
      `${file}: ${missing.length} untranslated, ${stale.length} to re-check` +
      ` (of ${ids.size})`;

    if (missing.length === 0 && stale.length === 0) {
      console.log(`✓ ${summary}`);
      continue;
    }
    if (draft) {
      console.log(`• ${summary} — draft, not enforced`);
      continue;
    }
    if (missing.length > 0) {
      problems.push(
        report(`${file}: ${missing.length} message(s) untranslated`, missing),
      );
    }
    if (stale.length > 0) {
      problems.push(
        report(
          `${file}: ${stale.length} translation(s) written against English that has since changed`,
          stale,
          'Re-check each, then remove it from `stale` in the catalog.',
        ),
      );
    }
  }

  if (problems.length === 0) {
    console.log('check-locales: catalogs are complete.');
    return;
  }

  console.error(`\ncheck-locales: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

function report(headline, offenders, hint) {
  const named = offenders
    .slice(0, SHOWN)
    .map((id) => `      ${id}`)
    .join('\n');
  const more =
    offenders.length > SHOWN
      ? `\n      …and ${offenders.length - SHOWN} more`
      : '';
  return [
    `  ✖ ${headline}`,
    offenders.length > 0 ? `${named}${more}` : null,
    hint ? `    → ${hint}` : null,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Every message id the source actually uses.
 *
 * A regex over the source rather than a real extraction, because an extraction is
 * a full build and this has to be cheap enough to run on every one. It only ever
 * reports ids the catalog has *never seen*, so the cost of the regex missing an
 * exotic form is a check that stays quiet — never a false failure.
 */
function idsInCode() {
  const ids = new Set();
  for (const file of sourceFiles(resolve(projectRoot, 'src/app'))) {
    const text = readFileSync(file, 'utf8');
    // $localize`:@@id:…` and $localize`:meaning|description@@id:…`
    for (const [, id] of text.matchAll(
      /\$localize`:[^`]*?@@([A-Za-z0-9._-]+):/g,
    )) {
      ids.add(id);
    }
    // i18n="…@@id" / i18n-aria-label="@@id" in a template
    for (const [, id] of text.matchAll(
      /\bi18n(?:-[\w.-]+)?="[^"]*@@([A-Za-z0-9._-]+)"/g,
    )) {
      ids.add(id);
    }
  }
  return ids;
}

/** `LANGUAGES` as the app declares it — the list the Settings control offers. */
function languagesInCode() {
  const text = localizationSource();
  const list = text.match(/export const LANGUAGES = \[([^\]]*)\]/)?.[1] ?? '';
  return [...list.matchAll(/'([a-z-]+)'/g)].map(([, code]) => code);
}

function sourceLanguageInCode() {
  return (
    localizationSource().match(
      /export const SOURCE_LANGUAGE: Language = '([a-z-]+)'/,
    )?.[1] ?? 'en'
  );
}

function localizationSource() {
  return readFileSync(
    resolve(projectRoot, 'src/app/shared/layout/localization.ts'),
    'utf8',
  );
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      yield path;
    }
  }
}

function catalogFiles() {
  return readdirSync(LOCALE_DIR)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        name !== SOURCE_FILE &&
        // `xx.sources.json` is authoring data (see sync-locales.mjs), not a catalog.
        !name.endsWith('.sources.json'),
    )
    .sort();
}

function readCatalog(name) {
  return JSON.parse(readFileSync(resolve(LOCALE_DIR, name), 'utf8'));
}

main();
