#!/usr/bin/env node
// Chord-line merger, FILE TO FILE — the CLI shell around `toAchordeon`.
//
//   Am        F         C
//   Some words of a song
//     ->  [Am]Some words[F] of a song[C]
//
// This exists so the conversion never passes through a model. Column arithmetic is
// done exactly by `to-achordeon.mjs`, and no lyric is ever read out, retyped, or
// printed: the input is a file, the output is a file, and everything on stdout is
// a COUNT, a LINE NUMBER or a CHORD SYMBOL — never a line of the song.
//
// It also handles the ChordPro-ish variants of the same input: files that already
// carry inline brackets pass through untouched, and `{title:}` / `{artist:}`
// directives become `*` / `**` markers.
//
// Usage:
//   node merge-chordlines.mjs <in.txt> -o <out.txt> [--tab N]
//
//   --tab N   tab stop width used to expand tabs before aligning (default 8)

import { readFileSync, writeFileSync } from 'node:fs';
import { toAchordeon } from './_domain.mjs';

// --- args ---
const args = process.argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const tabIdx = args.indexOf('--tab');
const tabWidth = tabIdx !== -1 ? Number(args[tabIdx + 1]) : 8;
// Positional = anything that is neither a flag nor a flag's value. Guard the
// `idx + 1` arithmetic: a missing flag has index -1, whose "value slot" is 0 — the
// input file's own position.
const taken = new Set(
  [outIdx, tabIdx].filter((i) => i !== -1).map((i) => i + 1),
);
const inFile = args.find((a, i) => !a.startsWith('-') && !taken.has(i));
if (!inFile || !outFile) {
  console.error(
    'usage: node merge-chordlines.mjs <in.txt> -o <out.txt> [--tab N]',
  );
  process.exit(2);
}
if (!Number.isInteger(tabWidth) || tabWidth < 1) {
  console.error('--tab must be a positive integer');
  process.exit(2);
}

const { text, report } = toAchordeon(readFileSync(inFile, 'utf8'), {
  tabWidth,
});
writeFileSync(outFile, text, 'utf8');

// --- summary (counts, line numbers and chord symbols only) ----------------
const bar = '─'.repeat(48);
console.log(bar);
console.log('Chord-line merge');
console.log(bar);
console.log(`In       : ${inFile}`);
console.log(`Out      : ${outFile}`);
console.log(`Lines    : ${report.linesIn} in → ${report.linesOut} out`);
console.log(
  `Merged   : ${report.merged} chord row(s) folded into the words below`,
);
console.log(`Bare rows: ${report.bareRows} chord-only row(s) → bracket lines`);
console.log(`Chords   : ${report.chordsPlaced} placed`);
if (report.alreadyInline)
  console.log(
    `Inline   : ${report.alreadyInline} line(s) already had [chords]; left as they were`,
  );
if (report.tabbedLines)
  console.log(
    `Tabs     : expanded on ${report.tabbedLines} line(s) at width ${tabWidth}`,
  );
if (report.wasCrlf) console.log('Newlines : CRLF input normalised to LF');
if (report.clamped)
  console.log(
    `Clamped  : ${report.clamped} chord(s) moved to the nearest legal spot (past a label, or past the end of the line)`,
  );
if (report.inlineTargets)
  console.log(
    `Mixed    : ${report.inlineTargets} merged line(s) already held brackets (annotations like [x2]); columns counted as printed`,
  );
if (report.directives.converted)
  console.log(
    `Directives: ${report.directives.converted} converted to * / ** markers`,
  );
if (report.directives.dropped)
  console.log(
    `Directives: ${report.directives.dropped} block marker(s) dropped (blocks are blank-line separated)`,
  );
if (report.directives.kept.length)
  console.log(
    `Directives: left as text → ${report.directives.kept.map((k) => `{${k}}`).join(' ')}`,
  );

if (report.promoted)
  console.log(
    `One-letter: ${report.promoted} row(s) like a lone F or C read as chords — this file has ${report.confirmed} unmistakable chord row(s), and each sat directly above a line of words`,
  );

if (report.ambiguous.length) {
  console.log('\n' + bar);
  console.log(
    'Left alone — a single one-letter token that could be a chord OR a word',
  );
  console.log(
    '(a Czech "a", an English "A"), with nothing in the file to settle it.',
  );
  console.log('Check these lines yourself:');
  console.log(`  lines ${report.ambiguous.join(', ')}`);
}

console.log('\n' + bar);
console.log(
  'Now run validate.mjs on the output, and read it against the source.',
);
