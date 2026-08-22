#!/usr/bin/env node
// The UI labels the docs quote, taken from the app's own translations.
//
// Writes `apps/docs/src/generated/ui-strings.json`, which the `<Ui>` MDX
// component reads. A doc that says "press New songbook" is quoting a string the
// app owns (`$localize`:@@songbooks.add:…``), and a hand-copied quote is wrong
// the first time the button is renamed — silently, in the language nobody on the
// team reads. So the docs name the **id** and the label is resolved from
// `apps/app/src/locale/`, the same files the app ships.
//
// **Only the ids the docs use.** The full tables are 652 strings and ~40 KB per
// locale; a docs page quotes a couple of dozen. This scans the `.mdx` for
// `<Ui id="…">` and emits exactly those, so nothing unused reaches the bundle.
//
// **Missing ids are fatal.** An id that no longer exists in the app is a doc
// describing a button that is gone — the failure this whole mechanism is for. It
// stops the build and names the ids rather than rendering a blank.
//
// Usage: node tools/gen-ui-strings.mjs

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'apps/docs/src/generated/ui-strings.json');

/** The app's locale tables, by the locale name Docusaurus uses. */
const LOCALES = {
  en: 'apps/app/src/locale/messages.json',
  cs: 'apps/app/src/locale/cs.json',
};

/** Where docs prose lives — English, and every translation of it. */
const DOC_DIRS = ['apps/docs/docs', 'apps/docs/i18n', 'apps/docs/src'];

// A literal id only: `[\w.-]+` skips the interpolated one in the component's own
// error message (`<Ui id="${id}">`), which is a string about ids, not a use.
const USE = /<Ui\b[^>]*\bid="([\w.-]+)"/g;

/** Every `.mdx`/`.tsx` file under `dir`, recursively. */
function* sources(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // A locale that has no translated docs yet is not an error.
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sources(path);
    } else if (/\.(mdx|tsx)$/.test(entry.name)) {
      yield path;
    }
  }
}

const ids = new Set();
for (const dir of DOC_DIRS) {
  for (const file of sources(join(root, dir))) {
    const text = readFileSync(file, 'utf8');
    for (const [, id] of text.matchAll(USE)) ids.add(id);
  }
}

const tables = Object.fromEntries(
  Object.entries(LOCALES).map(([locale, file]) => [
    locale,
    JSON.parse(readFileSync(join(root, file), 'utf8')).translations,
  ]),
);

const missing = [];
const out = {};
for (const [locale, table] of Object.entries(tables)) {
  out[locale] = {};
  for (const id of [...ids].sort()) {
    if (!(id in table)) {
      missing.push(`${id} (${locale})`);
      continue;
    }
    out[locale][id] = table[id];
  }
}

if (missing.length) {
  console.error(
    `gen-ui-strings: no such string in the app's translations:\n  ${missing.join('\n  ')}\n` +
      `Run \`nx sync-locales app\` if the id is new, or fix the id in the .mdx.`,
  );
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `gen-ui-strings: ${ids.size} strings × ${Object.keys(out).length} locales`,
);
