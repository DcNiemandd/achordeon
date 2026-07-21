#!/usr/bin/env node
// Achordeon song validator — runs the repo's REAL parser over song content and
// reports what it produced: effective title/subtitle, block count, shadowed
// warnings, and every bracket that will render VERBATIM (i.e. is not a
// transposable chord). Same grammar the app ships (docs/PARSER-GRAMMAR.md).
//
// Usage:
//   node validate.mjs <song.txt>       # validate a file
//   node validate.mjs -                # read content from stdin
//
// Zero Angular: it pairs the pure `parse` (from shared/domain) with a tiny
// ChordTheory built straight on @tonaljs, mirroring TonalChordTheory exactly.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { get as getChord } from '@tonaljs/chord';
import { chroma } from '@tonaljs/note';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up until we find the domain barrel — robust to where the skill lives.
function findDomainIndex(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(dir, 'libs/shared/domain/src/index.ts');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Could not locate libs/shared/domain/src/index.ts from ' + start,
  );
}

const jiti = createJiti(import.meta.url);
const domain = await jiti.import(findDomainIndex(__dirname));
const { parse, toEnglishNotation } = domain;

// The real adapter's logic (libs/.../tonal-chord-theory.ts), Angular-free.
const theory = {
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

// --- read input ---
const arg = process.argv[2];
if (!arg) {
  console.error('usage: node validate.mjs <song.txt|->');
  process.exit(2);
}
const content =
  arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');

// --- parse ---
const ast = parse(content, theory);

// --- report ---
const lines = content.split('\n');
const bar = '─'.repeat(48);
console.log(bar);
console.log('Achordeon validation');
console.log(bar);
console.log('Title    :', ast.title ?? '(none)');
console.log('Subtitle :', ast.subtitle ?? '(none)');
console.log('Blocks   :', ast.blocks.length);

let chordCount = 0;
const verbatim = [];
ast.blocks.forEach((b, bi) => {
  b.lines.forEach((ln) => {
    ln.chords.forEach((c) => {
      chordCount++;
      if (!c.valid) verbatim.push({ raw: c.raw, block: bi });
    });
  });
});
console.log(
  'Chords   :',
  chordCount,
  `(${verbatim.length} render verbatim / non-transposable)`,
);

if (ast.warnings.length) {
  console.log('\nWarnings:');
  for (const w of ast.warnings) {
    const src = (lines[w.line] ?? '').trim();
    console.log(`  • ${w.code} at line ${w.line + 1}: "${src}"`);
  }
}

if (verbatim.length) {
  console.log(
    '\nBrackets rendered verbatim (never transposed) — confirm these are intentional:',
  );
  const seen = new Set();
  for (const v of verbatim) {
    if (seen.has(v.raw)) continue;
    seen.add(v.raw);
    console.log(`  • [${v.raw}]`);
  }
}

const blockOnlyChords = ast.blocks.filter(
  (b) =>
    b.lines.length > 0 &&
    b.lines.every((l) => l.text.trim() === '' && l.chords.length > 0),
).length;
if (blockOnlyChords) {
  console.log(
    `\nChord-only blocks (render larger, bridge convention): ${blockOnlyChords}`,
  );
}

console.log('\n' + bar);
if (!ast.title) {
  console.log('NOTE: no title — add `* Title` unless intentionally omitted.');
}
console.log(
  ast.warnings.length === 0
    ? 'No warnings.'
    : `${ast.warnings.length} warning(s) above.`,
);
process.exit(0);
