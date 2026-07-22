#!/usr/bin/env node
// SYNTAX validator — parses song content with the repo's REAL parser and reports
// what came out: effective title/subtitle, block count, shadowed-title warnings,
// and any bracket that is not a recognised chord (renders verbatim). This checks
// that the MARKUP parses and is well-formed — it does NOT judge whether the
// chords are correct or match the source. Handy while transcribing.
//
// Usage:
//   node validate.mjs <song.txt>      # a file
//   node validate.mjs -               # content on stdin

import { readFileSync } from 'node:fs';
import { inspect } from './_domain.mjs';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node validate.mjs <song.txt|->');
  process.exit(2);
}
const content =
  arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
const r = inspect(content);

const bar = '─'.repeat(48);
console.log(bar);
console.log('Achordeon syntax check');
console.log(bar);
console.log('Title    :', r.title ?? '(none)');
console.log('Subtitle :', r.subtitle ?? '(none)');
console.log('Blocks   :', r.blockCount);
console.log(
  'Chords   :',
  r.chordCount,
  `(${r.verbatim.length} not recognised as chords → render verbatim)`,
);

if (r.warnings.length) {
  console.log('\nWarnings:');
  for (const w of r.warnings)
    console.log(`  • ${w.code} at line ${w.line + 1}: "${w.text}"`);
}
if (r.verbatim.length) {
  console.log(
    '\nBrackets that render verbatim (not transposable) — fine for [N.C.], [x2],',
  );
  console.log(
    'repeat signs, etc.; a real chord landing here means a typo in the symbol:',
  );
  for (const raw of r.verbatim) console.log(`  • [${raw}]`);
}
if (r.chordOnlyBlocks) {
  console.log(
    `\nChord-only blocks (render larger, bridge convention): ${r.chordOnlyBlocks}`,
  );
}

console.log('\n' + bar);
if (!r.title)
  console.log('NOTE: no title — add `* Title` unless intentionally omitted.');
console.log(
  r.warnings.length === 0
    ? 'No warnings.'
    : `${r.warnings.length} warning(s) above.`,
);
