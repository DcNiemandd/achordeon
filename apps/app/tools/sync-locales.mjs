// Syncs each translation catalog against the extracted source catalog.
//
// `ng extract-i18n` writes `messages.xlf` (the source, EN) and nothing else — it
// has no notion of merging into an existing translation. So after every extraction
// the Czech catalog is stale in three ways at once: new messages are absent,
// deleted ones linger, and changed source text sits under an old translation.
//
// This is that merge, and only that merge:
//
//   - a unit in the source but not in the catalog is **added, with no `<target>`**
//     (an empty target would be indistinguishable from a real translation, and the
//     build's "No translation found" warning is the only thing that tells the
//     truth about what is left to do);
//   - a unit whose `<source>` changed keeps its `<target>` but is flagged
//     `state="needs-translation"`, because a translation of text that has since
//     been reworded is a guess;
//   - a unit no longer in the source is dropped;
//   - everything else — the wording — is left exactly as the translator wrote it.
//
// Run: `node tools/sync-locales.mjs` from apps/app (or `nx run app:sync-locales`).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

function main() {
  const projectJson = JSON.parse(
    readFileSync(resolve(projectRoot, 'project.json'), 'utf8'),
  );
  const source = readFileSync(
    resolve(projectRoot, 'src/locale/messages.xlf'),
    'utf8',
  );
  const units = parseUnits(source);

  for (const [code, locale] of Object.entries(
    projectJson.i18n?.locales ?? {},
  )) {
    const path = resolve(projectRoot, '../..', locale.translation);
    const existing = new Map(
      Object.entries(parseUnits(readFileSync(path, 'utf8'))),
    );

    let added = 0;
    let stale = 0;
    const merged = Object.entries(units).map(([id, unit]) => {
      const previous = existing.get(id);
      if (previous === undefined) {
        added++;
        return withoutTarget(unit.xml);
      }
      const target = targetOf(previous.xml);
      if (target === null) return withoutTarget(unit.xml);
      if (previous.source !== unit.source) stale++;
      // Source line numbers move constantly, so the *source* unit is the skeleton
      // and only the target is carried over.
      return withTarget(unit.xml, target, previous.source !== unit.source);
    });

    writeFileSync(path, wrap(source, code, merged));
    const dropped = [...existing.keys()].filter((id) => !(id in units)).length;
    console.log(
      `${locale.translation}: ${merged.length} units (+${added} new, ${stale} need re-translation, -${dropped} removed)`,
    );
  }
}

// --- xlf, the three shapes we need -------------------------------------------

/** `{ [id]: { xml, source } }` for every `<trans-unit>` in a catalog. */
function parseUnits(xml) {
  const units = {};
  for (const [unit] of xml.matchAll(/<trans-unit\b[\s\S]*?<\/trans-unit>/g)) {
    const id = unit.match(/<trans-unit id="([^"]*)"/)?.[1];
    if (id === undefined) continue;
    units[id] = { xml: unit, source: sourceOf(unit) ?? '' };
  }
  return units;
}

const sourceOf = (unit) => unit.match(/<source>([\s\S]*?)<\/source>/)?.[1];
const targetOf = (unit) =>
  unit.match(/<target[^>]*>([\s\S]*?)<\/target>/)?.[1] ?? null;

/** The source unit, untranslated — the extractor's own output, unchanged. */
function withoutTarget(unit) {
  return unit.replace(/\s*<target[^>]*>[\s\S]*?<\/target>/, '');
}

/** The source unit carrying a translation, right after its `<source>`. */
function withTarget(unit, target, needsWork) {
  const state = needsWork ? ' state="needs-translation"' : '';
  return withoutTarget(unit).replace(
    /(<source>[\s\S]*?<\/source>)/,
    `$1\n        <target${state}>${target}</target>`,
  );
}

/** The source file's own header and footer, retargeted at `code`. */
function wrap(sourceXml, code, units) {
  const [head] = sourceXml.split('<trans-unit');
  return `${head
    .replace(/ target-language="[^"]*"/, '')
    .replace(
      /(source-language="[^"]*")/,
      `$1 target-language="${code}"`,
    )}${units.join('\n      ')}
    </body>
  </file>
</xliff>
`;
}

main();
