// Merges the freshly extracted source catalog into each translation catalog.
//
// `ng extract-i18n` writes `messages.json` (the source, EN) and nothing else — it
// has no notion of merging into an existing translation. So after every extraction
// each catalog is stale in three ways at once: new messages are absent, deleted
// ones linger, and a message whose English text changed still carries the old
// translation.
//
// This is that merge, and only that merge:
//
//   - a message in the source but not in the catalog is **added as `null`** — not
//     as a copy of the English, which would be indistinguishable from a real
//     translation and would silently ship as "translated";
//   - a message whose English changed keeps its translation but is listed under
//     `stale`, because a translation of text that has since been reworded is a
//     guess and only a human can say whether it still holds;
//   - a message no longer in the source is dropped;
//   - the wording itself is never touched.
//
// The catalogs are discovered, not configured: every `src/locale/*.json` except
// `messages.json` is one. Adding a language = adding `xx.json` here and `'xx'` to
// LANGUAGES in `app/shared/layout/localization.ts` — and `check-locales.mjs` fails
// the build if those two ever disagree.
//
// Run: `node tools/sync-locales.mjs` (or `nx run app:sync-locales`, which extracts
// first).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALE_DIR = resolve(here, '../src/locale');

/** The extracted source catalog. Every other `*.json` beside it is a translation. */
const SOURCE_FILE = 'messages.json';

function main() {
  // Sorted by id before anything reads it, and written back sorted.
  //
  // `extract-i18n` emits in discovery order, which is a property of the module
  // graph rather than of the messages: adding two files reshuffled 450 lines of
  // catalog and buried the nine new keys in the noise. Nothing downstream cares
  // about the order — the app loads these as a map, `check-locales.mjs` reads the
  // key set — so id order is free, and it makes the diff of an extraction show
  // exactly what changed. Every catalog below inherits it, because they are all
  // built by walking this one.
  const extracted = readCatalog(SOURCE_FILE);
  const source = sortById(extracted.translations);
  write(SOURCE_FILE, { ...extracted, translations: source });

  for (const file of catalogFiles()) {
    const language = file.replace(/\.json$/, '');
    const catalog = readCatalog(file);
    const previous = catalog.translations ?? {};
    // What the English said when each translation was written. Without it there is
    // no way to tell "translated" from "translated against text that has since
    // changed" — the difference between a catalog you can trust and one you can
    // only hope about. It lives in a sidecar because it is **authoring data**: the
    // catalog itself is fetched by every user of that language, and shipping the
    // English twice to a Czech reader is 24 kB of nothing.
    const against = readSidecar(language);

    const translations = {};
    const sources = {};
    const stale = [];
    let untranslated = 0;

    for (const [id, english] of Object.entries(source)) {
      const translated = previous[id] ?? null;
      translations[id] = translated;
      if (translated === null) {
        untranslated++;
        continue;
      }
      sources[id] = english;
      if (against[id] !== undefined && against[id] !== english) stale.push(id);
    }

    const dropped = Object.keys(previous).filter(
      (id) => !(id in source),
    ).length;

    write(file, {
      locale: catalog.locale,
      ...(catalog.draft === undefined ? {} : { draft: catalog.draft }),
      ...(stale.length > 0 ? { stale } : {}),
      translations,
    });
    write(`${language}.sources.json`, sources);

    console.log(
      `${file}: ${Object.keys(source).length} messages ` +
        `(${untranslated} untranslated, ${stale.length} to re-check, -${dropped} removed)`,
    );
  }
}

/** The same messages, keyed in id order. */
function sortById(translations) {
  return Object.fromEntries(
    Object.entries(translations).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
}

function write(name, data) {
  writeFileSync(
    resolve(LOCALE_DIR, name),
    `${JSON.stringify(data, null, 2)}\n`,
  );
}

/** The English each existing translation was written against, or `{}` the first
 * time round — a catalog with no sidecar yet is simply taken at its word. */
function readSidecar(language) {
  try {
    return readCatalog(`${language}.sources.json`);
  } catch {
    return {};
  }
}

function catalogFiles() {
  return readdirSync(LOCALE_DIR)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        name !== SOURCE_FILE &&
        !name.endsWith('.sources.json'),
    )
    .sort();
}

function readCatalog(name) {
  return JSON.parse(readFileSync(resolve(LOCALE_DIR, name), 'utf8'));
}

main();
