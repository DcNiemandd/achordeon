#!/usr/bin/env node
// Chord-line merger — turns the "chords on a line above the words" layout that
// plain-text chord sheets use into Achordeon's inline `[C]` brackets, FILE TO FILE.
//
//   Am        F         C
//   Some words of a song
//     ->  [Am]Some wor[F]ds of a[C] song
//
// This exists so the conversion never passes through a model. Column arithmetic is
// done exactly, and no lyric is ever read out, retyped, or printed: the input is a
// file, the output is a file, and everything on stdout is a COUNT, a LINE NUMBER or
// a CHORD SYMBOL — never a line of the song.
//
// It also handles the ChordPro-ish variants of the same input: files that already
// carry inline brackets pass through untouched, and `{title:}` / `{artist:}`
// directives become `*` / `**` markers.
//
// Usage:
//   node merge-chordlines.mjs <in.txt> -o <out.txt> [--tab N]
//
//   --tab N   tab stop width used to expand tabs before aligning (default 8)
//
// What it does NOT do: titles it cannot find, block labels, escaping stray colons,
// or judging whether a chord is right. Those stay with the caller, and they are all
// small structural edits — never whole lines.

import { readFileSync, writeFileSync } from 'node:fs';
import { theory } from './_domain.mjs';

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

// --- token classification -------------------------------------------------
// A token is "chordish" if the parser calls it a chord, or if it is one of the
// annotations that legitimately share a chord row: bar lines, repeat marks, N.C.

const BAR_RE = /^[|:/%()[\].,\-–—]+$/; // | :||: %  ( ) . , dashes
const REPEAT_RE = /^\(?\d*\s*[xX×]\s*\d*\)?$/; // x2  2x  2×  (2x)
const NC_RE = /^\(?N\.?\s?C\.?\)?$/i; // N.C.  NC  (N.C.)

/** Strip the wrapping a chord symbol picks up in the wild: (Am),  Am,  "Am". */
function core(token) {
  return token.replace(/^[("']+/, '').replace(/[)"',;]+$/, '');
}

function classify(token) {
  const c = core(token);
  const chord = c ? theory.parseChord(c) : null;
  if (chord) return { chordish: true, real: true };
  if (BAR_RE.test(token) || REPEAT_RE.test(token) || NC_RE.test(token))
    return { chordish: true, real: false };
  return { chordish: false, real: false };
}

/** Every whitespace-run-separated token with the column it starts at. */
function tokensOf(line) {
  const out = [];
  for (const m of line.matchAll(/\S+/g)) out.push({ text: m[0], col: m.index });
  return out;
}

/**
 * Is this a row of chords rather than a row of words?
 *
 * All tokens must be chordish and at least one must be a real chord — so a row of
 * bar lines alone is not a chord row.
 *
 * A ONE-letter row (`F`, `C`, `G`) is marked `ambiguous`: it is the commonest kind
 * of chord row there is, and also exactly what a one-word lyric line looks like (a
 * Czech "a", an English "A"). It is not decided here — see `usable`, which settles
 * it from the rest of the file.
 */
function chordRow(line) {
  const tokens = tokensOf(line);
  if (tokens.length === 0) return null;
  let real = 0;
  for (const t of tokens) {
    const k = classify(t.text);
    if (!k.chordish) return null;
    if (k.real) real++;
  }
  if (real === 0) return null;
  if (tokens.length === 1 && core(tokens[0].text).length < 2)
    return { tokens, ambiguous: true };
  return { tokens, ambiguous: false };
}

// --- read, normalise ------------------------------------------------------

/** Drop a leading byte-order mark, which a text editor may have left on the file. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

let text = stripBom(readFileSync(inFile, 'utf8'));
const crlf = /\r\n/.test(text);
text = text.replace(/\r\n?/g, '\n');

let tabbed = 0;
function expandTabs(line) {
  if (!line.includes('\t')) return line;
  tabbed++;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tabWidth - (out.length % tabWidth));
    else out += ch;
  }
  return out;
}

const lines = text.split('\n').map(expandTabs);

// --- ChordPro directives --------------------------------------------------
// {title:}/{artist:} carry the same meaning as `*`/`**`, so they convert cleanly.
// The block markers ({start_of_chorus} etc.) have no Achordeon equivalent — blocks
// are separated by blank lines — so they are dropped rather than left to render as
// stray words. Anything else is left alone and reported by NAME, never by content.
const DIRECTIVE_RE = /^\s*\{\s*([a-z_]+)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/i;
const TITLE_KEYS = new Set(['title', 't']);
const SUBTITLE_KEYS = new Set(['subtitle', 'st', 'artist']);
const DROP_RE = /^(?:start_of_|end_of_|so|eo)/i;

const stats = {
  merged: 0,
  bareRows: 0,
  chordsPlaced: 0,
  ambiguous: [],
  promoted: 0,
  alreadyInline: 0,
  inlineTargets: 0,
  directivesConverted: 0,
  directivesDropped: 0,
  directivesKept: [],
  clamped: 0,
};

const staged = [];
for (const line of lines) {
  const d = line.match(DIRECTIVE_RE);
  if (!d) {
    staged.push(line);
    continue;
  }
  const key = d[1].toLowerCase();
  const value = (d[2] ?? '').trim();
  if (TITLE_KEYS.has(key) && value) {
    staged.push(`* ${value}`);
    stats.directivesConverted++;
  } else if (SUBTITLE_KEYS.has(key) && value) {
    staged.push(`** ${value}`);
    stats.directivesConverted++;
  } else if (DROP_RE.test(key)) {
    stats.directivesDropped++;
  } else {
    staged.push(line);
    stats.directivesKept.push(key);
  }
}

// --- merge ----------------------------------------------------------------

/** A line that already carries inline chords is left exactly as it is. */
const INLINE_RE = /(^|[^\\])\[[^\]]*\]/;

/** Where a label's delimiter colon ends, so a chord is never spliced into a label. */
function labelEnd(line) {
  const m = line.match(/^\s*[^\s:][^:]*?:+(?=\s|$)/);
  return m ? m[0].length : 0;
}

/**
 * Map printed column → string index for a lyric line.
 *
 * A bracket run takes no width on the page: `[x2]`, `[N.C.]` and any chord already
 * inline are printed above the words, not among them. So a line that already
 * carries brackets still aligns with the chord row above it — as long as we count
 * columns the way the reader sees them and not the way the string stores them.
 * Without this, one `[x2]` at the end of a line would throw every chord on that
 * line four characters to the left.
 *
 * The returned array has one entry per printed column plus one past the end.
 */
function columnIndex(line) {
  const map = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length) {
      map.push(i); // an escaped character prints as one column
      i += 2;
      continue;
    }
    if (line[i] === '[') {
      let depth = 0;
      while (i < line.length) {
        if (line[i] === '[') depth++;
        else if (line[i] === ']' && --depth === 0) {
          i++;
          break;
        }
        i++;
      }
      continue; // zero printed columns
    }
    map.push(i);
    i++;
  }
  map.push(line.length);
  return map;
}

function splice(chordTokens, lyric) {
  const map = columnIndex(lyric);
  const lastCol = map.length - 1;
  const firstWord = lyric.search(/\S/);
  const floor = Math.max(firstWord === -1 ? 0 : firstWord, labelEnd(lyric));
  if (INLINE_RE.test(lyric)) stats.inlineTargets++;

  // Group by the index the chord will actually land at: several chords clamped to
  // the same spot become one bracket, which is exactly how Achordeon writes them.
  const groups = new Map();
  for (const t of chordTokens) {
    let at;
    if (t.col >= lastCol) {
      at = lyric.length; // chord hangs past the end of the words
      stats.clamped++;
    } else {
      at = map[t.col];
    }
    if (at < floor) {
      at = floor; // never inside a label, never before the first word
      stats.clamped++;
    }
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(t.text);
    stats.chordsPlaced++;
  }

  // Right to left, so an insertion never shifts an index still to be used.
  let out = lyric;
  for (const at of [...groups.keys()].sort((a, b) => b - a)) {
    const bracket = `[${groups.get(at).join(' ')}]`;
    out = out.slice(0, at) + bracket + out.slice(at);
  }
  return out;
}

// A row of guitar tablature is not a lyric, and splicing a chord into one turns a
// readable diagram into rubble. `e|--1---3--|`, `B|--0--|`, and the bare `|---|`.
const TAB_RE = /^\s*[a-gA-G]?\s*\|[-0-9|hpb/\\~*\s]*$/;

const rows = staged.map(chordRow);
// Does this file demonstrably use the chords-above-lyrics layout? One unambiguous
// chord row is proof enough. That is what settles the one-letter rows: in a file
// already full of chord rows, an `F` on its own line above a line of words is a
// chord — reading it as a lyric would silently drop half the song's chords. In a
// file with no chord rows at all, nothing licenses that reading, so it stands.
const confirmed = rows.filter((r) => r && !r.ambiguous).length;

const result = [];
for (let i = 0; i < staged.length; i++) {
  const line = staged[i];

  if (INLINE_RE.test(line)) {
    stats.alreadyInline++;
    result.push(line);
    continue;
  }
  if (/^\s*\*/.test(line)) {
    result.push(line); // title/subtitle marker — never a chord row
    continue;
  }

  const row = rows[i];
  if (!row) {
    result.push(line);
    continue;
  }

  // A line that already carries brackets is still a merge target: `splice` counts
  // printed columns, so an `[x2]` annotation does not shift the chords over it.
  const next = staged[i + 1];
  const nextIsLyric =
    next !== undefined &&
    next.trim() !== '' &&
    !rows[i + 1] &&
    !/^\s*\*/.test(next) &&
    !TAB_RE.test(next);

  if (row.ambiguous && !(confirmed > 0 && nextIsLyric)) {
    stats.ambiguous.push(result.length + 1); // numbered in the OUTPUT, the file the reader opens
    result.push(line);
    continue;
  }
  if (row.ambiguous) stats.promoted++;

  if (nextIsLyric) {
    result.push(splice(row.tokens, next));
    stats.merged++;
    i++; // the lyric line has been consumed into the merged line
  } else {
    // Intro, solo, turnaround: a row of chords with no words under it. Achordeon
    // renders a bracket-only line in the line, at lyric size — which is the look.
    result.push(`${' '.repeat(0)}[${row.tokens.map((t) => t.text).join(' ')}]`);
    stats.bareRows++;
  }
}

let output = result.join('\n');
if (!output.endsWith('\n')) output += '\n';
writeFileSync(outFile, output, 'utf8');

// --- summary (counts, line numbers and chord symbols only) ----------------
const bar = '─'.repeat(48);
console.log(bar);
console.log('Chord-line merge');
console.log(bar);
console.log(`In       : ${inFile}`);
console.log(`Out      : ${outFile}`);
console.log(`Lines    : ${lines.length} in → ${result.length} out`);
console.log(
  `Merged   : ${stats.merged} chord row(s) folded into the words below`,
);
console.log(`Bare rows: ${stats.bareRows} chord-only row(s) → bracket lines`);
console.log(`Chords   : ${stats.chordsPlaced} placed`);
if (stats.alreadyInline)
  console.log(
    `Inline   : ${stats.alreadyInline} line(s) already had [chords]; left as they were`,
  );
if (tabbed)
  console.log(`Tabs     : expanded on ${tabbed} line(s) at width ${tabWidth}`);
if (crlf) console.log('Newlines : CRLF input normalised to LF');
if (stats.clamped)
  console.log(
    `Clamped  : ${stats.clamped} chord(s) moved to the nearest legal spot (past a label, or past the end of the line)`,
  );
if (stats.inlineTargets)
  console.log(
    `Mixed    : ${stats.inlineTargets} merged line(s) already held brackets (annotations like [x2]); columns counted as printed`,
  );
if (stats.directivesConverted)
  console.log(
    `Directives: ${stats.directivesConverted} converted to * / ** markers`,
  );
if (stats.directivesDropped)
  console.log(
    `Directives: ${stats.directivesDropped} block marker(s) dropped (blocks are blank-line separated)`,
  );
if (stats.directivesKept.length)
  console.log(
    `Directives: left as text → ${[...new Set(stats.directivesKept)].map((k) => `{${k}}`).join(' ')}`,
  );

if (stats.promoted)
  console.log(
    `One-letter: ${stats.promoted} row(s) like a lone F or C read as chords — this file has ${confirmed} unmistakable chord row(s), and each sat directly above a line of words`,
  );

if (stats.ambiguous.length) {
  console.log('\n' + bar);
  console.log(
    'Left alone — a single one-letter token that could be a chord OR a word',
  );
  console.log(
    '(a Czech "a", an English "A"), with nothing in the file to settle it.',
  );
  console.log('Check these lines yourself:');
  console.log(`  lines ${stats.ambiguous.join(', ')}`);
}

console.log('\n' + bar);
console.log(
  'Now run validate.mjs on the output, and read it against the source.',
);
