// Shared domain loader for the song skill scripts — the IN-REPO half.
//
// ┌─ TWO FILES, ONE NAME ────────────────────────────────────────────────────┐
// │ This file loads the repo's own TypeScript through jiti. The distributable │
// │ skill ships a file at the same path that is instead a dependency-free     │
// │ BUNDLE of exactly these exports (built by `nx run skill:gen-skill-bundle`,│
// │ see tools/skill/). Same specifier, two implementations — which is what    │
// │ lets `validate.mjs`, `merge-chordlines.mjs` and `build-import.mjs` be     │
// │ byte-identical in the repo and in the zip: the scripts that ship are the  │
// │ scripts that were tested, with no packaging rewrite in between.           │
// │                                                                          │
// │ Change what this file exports and you must change the bundle's entry too. │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Everything the CLIs need — the parser, the chord theory, the converter, the
// settings registry, the schema version — comes from here, so the scripts can
// never drift from the shipped grammar or schema.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { toAchordeon as convert } from './to-achordeon.mjs';

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

export const { parse, toEnglishNotation, SETTINGS, SCHEMA_VERSION } = domain;

/**
 * The app's real chord recogniser (ADR-0008's one `@tonaljs/*` importer).
 *
 * This used to be a hand-copied reimplementation living in this file, which meant
 * the skill and the app could disagree about what counts as a chord — the one
 * thing a syntax checker must never do. It is the shipped adapter now.
 */
export const theory = new TonalChordTheory();

/** Somebody else's chord sheet → Achordeon markup, with the theory bound. */
export function toAchordeon(text, options = {}) {
  return convert(text, { theory, ...options });
}

/** Song-scope setting keys the SETTINGS registry allows (point 5 guardrail). */
export const SONG_SETTING_KEYS = Object.keys(SETTINGS).filter((k) =>
  SETTINGS[k].scopes.includes('song'),
);
export const SONGBOOK_SETTING_KEYS = Object.keys(SETTINGS).filter((k) =>
  SETTINGS[k].scopes.includes('songbook'),
);

/**
 * Parse `content` and summarise what the parser made of it. This is a SYNTAX
 * check — does the markup parse, what structure came out, which brackets are not
 * recognised as chords. It says nothing about whether the chords are musically
 * right or match the source; that is the transcriber's job, not the parser's.
 */
export function inspect(content) {
  const ast = parse(content, theory);
  const srcLines = content.split('\n');

  let chordCount = 0;
  const verbatim = [];
  for (const b of ast.blocks) {
    for (const ln of b.lines) {
      for (const c of ln.chords) {
        chordCount++;
        if (!c.valid) verbatim.push(c.raw);
      }
    }
  }
  // Rows with chords and no words: their chords render IN the line, at lyric size.
  const chordRows = ast.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.text.trim() === '' && l.chords.length > 0).length;
  const subLabels = ast.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.label !== undefined).length;
  // Every label as it will PRINT — the delimiter colon is already consumed, so a
  // sheet's `R:` written as `R:` surfaces here as a bare `R`. Without this the fix
  // loop has no way to see a lost colon.
  const labels = [];
  for (const b of ast.blocks) {
    if (b.label !== undefined) labels.push(b.label);
    for (const ln of b.lines) if (ln.label !== undefined) labels.push(ln.label);
  }

  return {
    title: ast.title,
    subtitle: ast.subtitle,
    blockCount: ast.blocks.length,
    chordCount,
    verbatim: [...new Set(verbatim)],
    chordRows,
    labels,
    subLabels,
    warnings: ast.warnings.map((w) => ({
      code: w.code,
      line: w.line,
      text: (srcLines[w.line] ?? '').trim(),
    })),
    cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
  };
}
