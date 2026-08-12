// Build the Google Fonts family index — ADR-0016 (two front-ends, one path)
//
// Turns a pasted Google Fonts embed URL into TTF URLs the app can actually
// fetch. **Generated, not probed**, because the `google/fonts` repo layout is
// irregular in ways no template survives: the licence directory is `ofl/`,
// `apache/` or `ufl/` depending on the family; some families ship
// `static/Family-Regular.ttf` and some ship only `Family[wght].ttf`; and
// `ofl/oswald/static/Oswald-Regular.ttf` 404s where `ofl/oswald/Oswald[wght].ttf`
// answers. Guessing means guessing against something that moves.
//
// Nor can the embed URL's own CSS be followed: `fonts.googleapis.com/css2`
// answers by User-Agent — TTF to curl, woff2 to a browser — and `User-Agent` is
// a forbidden header name, so `fetch` silently drops any attempt to set it. The
// query string is read for family names; the CSS is never requested.
//
// Run by hand, output committed. It is a snapshot of someone else's repository,
// so regenerating it is a decision ("pick up the fonts added since"), not
// something a build should do behind your back — and a build that needed the
// network to produce a deterministic artefact would not be one.
//
//   node apps/app/tools/gen-font-index.mjs
//
// The index is served from `public/` and fetched **only** when a Google Fonts
// URL is pasted. It never touches a render, and nothing else loads it.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TREE =
  'https://api.github.com/repos/google/fonts/git/trees/main?recursive=1';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../public/fonts/google-index.json',
);

/** The licence directories the repo files families under. */
const LICENSES = new Set(['ofl', 'apache', 'ufl']);

/**
 * The key a family name is looked up by.
 *
 * The repo's own folder convention: lowercase, everything but letters and
 * digits dropped — "Crimson Text" is `crimsontext`, not `crimson-text`. Applied
 * to the query-string name at read time too, so the two agree by construction.
 */
function familyKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const response = await fetch(TREE, {
  headers: { accept: 'application/vnd.github+json' },
});
if (!response.ok) {
  throw new Error(`google/fonts tree: ${response.status}`);
}
const tree = await response.json();
if (tree.truncated) {
  // A partial tree would silently produce an index missing families, which
  // fails as "that font does not exist" long after this ran.
  throw new Error('google/fonts tree came back truncated');
}

/** familyKey → { d: directory, f: [file names] } */
const index = {};
for (const entry of tree.tree) {
  if (entry.type !== 'blob' || !entry.path.endsWith('.ttf')) continue;
  const parts = entry.path.split('/');
  if (!LICENSES.has(parts[0])) continue;
  // `ofl/oswald/Oswald[wght].ttf` and `ofl/lora/static/Lora-Regular.ttf` — the
  // family folder is the second segment either way.
  const dir = `${parts[0]}/${parts[1]}`;
  const file = parts.slice(2).join('/');
  const key = parts[1];
  const row = (index[key] ??= { d: dir, f: [] });
  row.f.push(file);
}

for (const row of Object.values(index)) row.f.sort();

const families = Object.keys(index).sort();
const sorted = {};
for (const key of families) sorted[key] = index[key];

writeFileSync(OUT, JSON.stringify(sorted));

const bytes = JSON.stringify(sorted).length;
console.log(
  `google-index.json: ${families.length} families, ${(bytes / 1024).toFixed(0)} KB`,
);

export { familyKey };
