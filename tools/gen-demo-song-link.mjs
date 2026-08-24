#!/usr/bin/env node
// The demo song's link, written into the tutorial that hands it out.
//
// `fit-a-song-on-one-page.mdx` opens with a link the reader taps, and the rest
// of the page repairs the song that arrives. The screenshots on that page are of
// the same song, imported through the same link by the shot harness — so the
// literal in the `.mdx` and the recipe the shots use have to be one thing.
//
// They are: `apps/app-e2e/shots/demo-song.ts` is the recipe, and this rewrites
// the `#z1=…` fragment of each tutorial's link from it. One song per language:
// the broken settings are shared (they are what the steps talk about), the words
// are not.
//
// Usage:
//   node tools/gen-demo-song-link.mjs           # rewrite both pages
//   node tools/gen-demo-song-link.mjs --check   # fail if either is stale

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The page each locale's link lives in. */
const PAGES = {
  en: 'apps/docs/docs/tutorials/fit-a-song-on-one-page.mdx',
  cs: 'apps/docs/i18n/cs/docusaurus-plugin-content-docs/current/tutorials/fit-a-song-on-one-page.mdx',
};

/** The link, as the page writes it: the app's address and a `z1` fragment. */
const LINK = /https:\/\/achordeon\.eu\/app\/#z1=[A-Za-z0-9_-]+/;

/**
 * The recipe, as a module this script can call.
 *
 * It is TypeScript, and it is where it is because the shot harness is its other
 * caller — bundling it here is cheaper than keeping a second copy of the song in
 * a `.mjs` that would drift from the one the pictures are taken of.
 */
async function loadRecipe() {
  const out = join(
    mkdtempSync(join(tmpdir(), 'achordeon-demo-')),
    'recipe.mjs',
  );
  await build({
    entryPoints: [join(root, 'apps/app-e2e/shots/demo-song.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['node:zlib'],
  });
  return import(pathToFileURL(out).href);
}

const { demoSongLink } = await loadRecipe();
const isCheck = process.argv.includes('--check');
const stale = [];

for (const [locale, page] of Object.entries(PAGES)) {
  const path = join(root, page);
  const text = readFileSync(path, 'utf8');
  const found = LINK.exec(text);
  if (!found) {
    console.error(`gen-demo-song-link: no demo link in ${page}`);
    process.exit(1);
  }
  const link = demoSongLink(locale);
  if (found[0] === link) continue;
  if (isCheck) {
    stale.push(page);
    continue;
  }
  writeFileSync(path, text.replace(LINK, link), 'utf8');
  console.log(`gen-demo-song-link: ${locale} → ${page}`);
}

if (stale.length) {
  console.error(
    `gen-demo-song-link: stale link in:\n  ${stale.join('\n  ')}\n` +
      'Run `node tools/gen-demo-song-link.mjs` and commit the pages.',
  );
  process.exit(1);
}
