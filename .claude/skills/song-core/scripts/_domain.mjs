// Shared domain loader for the song skill scripts — the IN-REPO half.
//
// ┌─ TWO FILES, ONE NAME ────────────────────────────────────────────────────┐
// │ This file loads the repo's own TypeScript through jiti. The distributable │
// │ skill ships a file at the same path that is instead a dependency-free     │
// │ BUNDLE of exactly these exports (`nx run skill:gen-skill-bundle`, entry   │
// │ at tools/skill/bundle-entry.mjs). Same specifier, two implementations —   │
// │ which is what lets `validate.mjs`, `merge-chordlines.mjs` and             │
// │ `build-import.mjs` be byte-identical in the repo and in the zip: the      │
// │ scripts that ship are the scripts that were tested, with no packaging     │
// │ rewrite in between.                                                      │
// │                                                                          │
// │ Everything both halves have in common is in `_domain-core.mjs`, so this   │
// │ file and the bundle's entry differ ONLY in how the domain is got hold of. │
// └──────────────────────────────────────────────────────────────────────────┘

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { makeDomain } from './_domain-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up until the domain barrel is found — robust to where the skill lives. */
export function findRepoRoot(start = HERE) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, 'libs/shared/domain/src/index.ts'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Could not locate libs/shared/domain/src/index.ts from ' + start,
  );
}

const repoRoot = findRepoRoot();
const domainEntry = resolve(repoRoot, 'libs/shared/domain/src/index.ts');
// The chord-theory lib imports the domain by its workspace alias; jiti resolves
// node specifiers, not tsconfig paths, so it is told the one mapping it needs.
const jiti = createJiti(import.meta.url, {
  alias: { '@achordeon/shared/domain': domainEntry },
});
const domain = await jiti.import(domainEntry);
const { TonalChordTheory } = await jiti.import(
  resolve(repoRoot, 'libs/shared/chord-theory/src/index.ts'),
);

export const {
  parse,
  toEnglishNotation,
  SETTINGS,
  SCHEMA_VERSION,
  ACHORDEON_URL,
  // The app's real chord recogniser (ADR-0008's one `@tonaljs/*` importer). This
  // used to be a hand-copied reimplementation living in this file, which meant the
  // skill and the app could disagree about what counts as a chord — the one thing
  // a syntax checker must never do.
  theory,
  toAchordeon,
  SONG_SETTING_KEYS,
  SONGBOOK_SETTING_KEYS,
  inspect,
} = makeDomain({
  parse: domain.parse,
  toEnglishNotation: domain.toEnglishNotation,
  SETTINGS: domain.SETTINGS,
  SCHEMA_VERSION: domain.SCHEMA_VERSION,
  ACHORDEON_URL: domain.ACHORDEON_URL,
  theory: new TonalChordTheory(),
});
