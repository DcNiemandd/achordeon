#!/usr/bin/env node
// Chord-line merger, FILE TO FILE — the CLI shell around `toAchordeon`, which is
// the app's own `convertChordSheet` (libs/shared/domain) with the theory bound.
//
//   Am        F         C
//   Some words of a song
//     ->  [Am]Some words[F] of a song[C]
//
// This exists so the conversion never passes through a model. Column arithmetic is
// done exactly by the domain's conversion, and no lyric is ever read out, retyped, or
// printed: the input is a file, the output is a file, and everything on stdout is
// a COUNT, a LINE NUMBER or a CHORD SYMBOL — never a line of the song.
//
// It also handles the ChordPro-ish variants of the same input: files that already
// carry inline brackets pass through untouched, and `{title:}` / `{artist:}`
// directives become `*` / `**` markers. A German sheet (`H`, `B` for B♭, `Fis`,
// `mi`) is rewritten into English chord names — guessed, or `--dialect german`.
//
// Usage:
//   node merge-chordlines.mjs <in.txt> -o <out.txt> [--tab N] [--dialect D]
//
//   --tab N       tab stop width used to expand tabs before aligning (default 8)
//   --dialect D   english | german — the note names the SOURCE is written in.
//                 Omitted: guessed (an H or a mi among the chords → german).

import { readFileSync, writeFileSync } from 'node:fs';
import { toAchordeon } from './_domain.mjs';

// --- args ---
const args = process.argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const tabIdx = args.indexOf('--tab');
const tabWidth = tabIdx !== -1 ? Number(args[tabIdx + 1]) : 8;
const dialectIdx = args.indexOf('--dialect');
const dialect = dialectIdx !== -1 ? args[dialectIdx + 1] : undefined;
// Positional = anything that is neither a flag nor a flag's value. Guard the
// `idx + 1` arithmetic: a missing flag has index -1, whose "value slot" is 0 — the
// input file's own position.
const taken = new Set(
  [outIdx, tabIdx, dialectIdx].filter((i) => i !== -1).map((i) => i + 1),
);
const inFile = args.find((a, i) => !a.startsWith('-') && !taken.has(i));
if (!inFile || !outFile) {
  console.error(
    'usage: node merge-chordlines.mjs <in.txt> -o <out.txt> [--tab N] [--dialect english|german]',
  );
  process.exit(2);
}
if (!Number.isInteger(tabWidth) || tabWidth < 1) {
  console.error('--tab must be a positive integer');
  process.exit(2);
}
if (dialect !== undefined && dialect !== 'english' && dialect !== 'german') {
  console.error('--dialect must be english or german');
  process.exit(2);
}

const result = toAchordeon(readFileSync(inFile, 'utf8'), {
  tabWidth,
  ...(dialect ? { dialect } : {}),
});
const { text, report } = result;
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
  `Format   : ${result.format}${result.songCount > 1 ? `, ${result.songCount} songs` : ''}`,
);
console.log(
  `Dialect  : ${result.dialect}${dialect ? ' (as told)' : ` (guessed ${result.guessedDialect})`}${report.respelled ? `, ${report.respelled} chord(s) respelled into English` : ''}`,
);
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
    `Directives: ${report.directives.converted} converted (titles, key/capo, sections, comments)`,
  );
if (report.directives.dropped.length)
  console.log(
    `Directives: dropped, nothing to become → ${report.directives.dropped.map((k) => `{${k}}`).join(' ')}`,
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
