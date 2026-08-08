#!/usr/bin/env node
// The skill's `_domain.mjs` — plan §3
//
// The skill cannot ship the repo. Its sandbox has Node but **no network**, so
// `npm install` is not available and jiti cannot load a `.ts`. So the parser, the
// chord theory (tonal included), the converter, the settings registry and the
// schema version are bundled into one dependency-free `.mjs`, which the zip
// installs under the name the scripts already import.
//
// Everything involved is pure and Angular-free already, which is why this is a
// bundler config and not a refactor.
//
// Usage: node tools/gen-skill-bundle.mjs [-o <file>]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const outIdx = process.argv.indexOf('-o');
const outFile =
  outIdx !== -1
    ? resolve(process.cwd(), process.argv[outIdx + 1])
    : resolve(root, 'dist/skill/_domain.mjs');

mkdirSync(dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, 'tools/skill/bundle-entry.mjs')],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  // `node`, not `neutral`: neutral clears the resolution conditions, and tonal's
  // package exports then resolve to nothing. Nothing in here touches a Node API —
  // the smoke test below is what proves it.
  platform: 'node',
  target: 'node20',
  // The chord-theory lib reaches for the domain by its workspace alias, which
  // exists only in tsconfig — esbuild is told the one mapping it needs.
  alias: {
    '@achordeon/shared/domain': resolve(
      root,
      'libs/shared/domain/src/index.ts',
    ),
  },
  // Readable on purpose. Somebody will open this file in a sandbox with no
  // debugger and no source map, wondering why their song did not parse; a minified
  // wall would be the difference between an answerable question and a shrug.
  minify: false,
  legalComments: 'inline',
  banner: {
    js: [
      '// Achordeon skill domain bundle — GENERATED, do not edit.',
      '//',
      "// The app's own parser, chord theory, converter and settings registry, built",
      "// from the repo by tools/gen-skill-bundle.mjs. It is the zip's half of the two",
      "// files named `_domain.mjs`; the other loads the repo's TypeScript through jiti.",
      '// Regenerate rather than patch — a fix made here is lost on the next build and,',
      '// worse, makes the skill disagree with the app it is writing for.',
    ].join('\n'),
  },
});

// The whole point of the exercise: a file that runs where nothing can be
// installed. A surviving bare import would only fail later, in a sandbox, with no
// way to fix it — so it fails here instead.
const code = readFileSync(outFile, 'utf8');
const bare = [
  ...code.matchAll(/^\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/gm),
]
  .map((m) => m[1])
  .filter((spec) => !spec.startsWith('.') && !spec.startsWith('node:'));
if (bare.length) {
  console.error(
    `gen-skill-bundle: the bundle still depends on ${[...new Set(bare)].join(', ')} — it would not run in the skill's sandbox.`,
  );
  process.exit(1);
}

// The zip's scripts import these by name; a rename in the domain would otherwise
// surface as `undefined is not a function` inside somebody else's assistant.
const REQUIRED = [
  'parse',
  'toEnglishNotation',
  'SETTINGS',
  'SCHEMA_VERSION',
  'ACHORDEON_URL',
  'theory',
  'toAchordeon',
  'SONG_SETTING_KEYS',
  'SONGBOOK_SETTING_KEYS',
  'inspect',
];
const exported = await import(`file://${outFile.replace(/\\/g, '/')}`);
const missing = REQUIRED.filter((name) => exported[name] === undefined);
if (missing.length) {
  console.error(`gen-skill-bundle: bundle exports no ${missing.join(', ')}.`);
  process.exit(1);
}

writeFileSync(outFile, code, 'utf8');
const kb = (Buffer.byteLength(code) / 1024).toFixed(0);
console.log(`gen-skill-bundle: wrote ${outFile} (${kb} KB, no dependencies)`);
console.log(`  exports: ${REQUIRED.join(', ')}`);
