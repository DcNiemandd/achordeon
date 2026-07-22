// Shared domain loader for the song-from-image skill scripts.
//
// Loads the REPO'S OWN domain layer (the same pure code the app ships) through
// jiti, and pairs it with a tonal-backed ChordTheory that mirrors the app's
// TonalChordTheory exactly. Everything the CLIs need — the parser, the settings
// registry, the schema version — comes from here, so the scripts can never drift
// from the shipped grammar or schema.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { get as getChord } from '@tonaljs/chord';
import { chroma } from '@tonaljs/note';

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
const jiti = createJiti(import.meta.url);
const domain = await jiti.import(
  resolve(repoRoot, 'libs/shared/domain/src/index.ts'),
);

export const { parse, toEnglishNotation, SETTINGS, SCHEMA_VERSION } = domain;

/** The app's real adapter logic (tonal-chord-theory.ts), Angular-free. */
export const theory = {
  parseChord(text) {
    const symbol = toEnglishNotation(text);
    const chord = getChord(symbol);
    if (chord.empty || !chord.tonic) return null;
    const root = chord.tonic;
    const bass = chord.bass ? chord.bass : null;
    let quality = symbol.startsWith(root) ? symbol.slice(root.length) : symbol;
    if (bass) {
      const slash = quality.lastIndexOf('/');
      if (slash !== -1) quality = quality.slice(0, slash);
    }
    return { root, bass, quality };
  },
  noteChroma(note) {
    const c = chroma(toEnglishNotation(note));
    return Number.isFinite(c) ? c : null;
  },
};

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
 * right or match the source image; that is the transcriber's job, not the
 * parser's.
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
  const chordOnlyBlocks = ast.blocks.filter(
    (b) =>
      b.lines.length > 0 &&
      b.lines.every((l) => l.text.trim() === '' && l.chords.length > 0),
  ).length;

  return {
    title: ast.title,
    subtitle: ast.subtitle,
    blockCount: ast.blocks.length,
    chordCount,
    verbatim: [...new Set(verbatim)],
    chordOnlyBlocks,
    warnings: ast.warnings.map((w) => ({
      code: w.code,
      line: w.line,
      text: (srcLines[w.line] ?? '').trim(),
    })),
    cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
  };
}
