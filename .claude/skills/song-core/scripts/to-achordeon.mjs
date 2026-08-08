// Somebody else's chord sheet → Achordeon markup. Pure text in, text out.
//
//   Am        F         C
//   Some words of a song
//     ->  [Am]Some words[F] of a song[C]
//
// Two unrelated jobs, which is why the name is the OUTCOME rather than the
// mechanism: folding a chord row into the words below it, and turning ChordPro
// `{title:}` / `{artist:}` directives into `*` / `**` markers. Any
// mechanism-shaped name would describe only one of them.
//
// **No `fs`, no `process`, no `console`.** The CLI (`merge-chordlines.mjs`) is a
// thin wrapper around this, and the skill bundle (`_domain.mjs`) carries it, so
// this file has to run identically in a terminal and inside a sandbox that has
// neither. Nothing here reads a lyric out either: the report carries counts, line
// numbers and chord symbols, never a line of the song.
//
// **Linear scanners, not backtracking regex.** The input is arbitrary text off
// the internet. It runs in the skill rather than the app, so a catastrophic
// pattern would hang a user's own terminal rather than their library — but that is
// exactly the input one needs, so the handful of patterns whose worst case was
// quadratic are hand-written scans instead. The ones that survive are anchored
// over a single disjoint character class, where there is nothing to backtrack.
//
// What it does NOT do: titles it cannot find, block labels, escaping stray colons,
// or judging whether a chord is right. Those stay with the caller, and they are
// all small structural edits — never whole lines.

/** @typedef {{ parseChord: (text: string) => unknown }} Theory */

/**
 * @typedef {object} ConversionReport
 * @property {number} linesIn          lines read
 * @property {number} linesOut         lines written
 * @property {number} merged           chord rows folded into the words below
 * @property {number} bareRows         chord-only rows that became bracket lines
 * @property {number} chordsPlaced     brackets written
 * @property {number} alreadyInline    lines that already had [chords], left alone
 * @property {number} inlineTargets    merged lines that already held brackets
 * @property {number} clamped          chords moved to the nearest legal spot
 * @property {number} promoted         one-letter rows read as chords after all
 * @property {number} confirmed        unmistakable chord rows found in the file
 * @property {number[]} ambiguous      OUTPUT line numbers left for a human
 * @property {number} tabbedLines      lines whose tabs were expanded
 * @property {boolean} wasCrlf         input had CRLF newlines
 * @property {{converted: number, dropped: number, kept: string[]}} directives
 */

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

function classify(token, theory) {
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
 * Czech "a", an English "A"). It is not decided here — see the merge pass, which
 * settles it from the rest of the file.
 */
function chordRow(line, theory) {
  const tokens = tokensOf(line);
  if (tokens.length === 0) return null;
  let real = 0;
  for (const t of tokens) {
    const k = classify(t.text, theory);
    if (!k.chordish) return null;
    if (k.real) real++;
  }
  if (real === 0) return null;
  if (tokens.length === 1 && core(tokens[0].text).length < 2)
    return { tokens, ambiguous: true };
  return { tokens, ambiguous: false };
}

// --- linear scanners ------------------------------------------------------

const WS = new Set([' ', '\t']);

/**
 * Does this line already carry an unescaped `[…]`?
 *
 * Linear: the first unescaped `[` is the only one worth asking about — if no `]`
 * follows it, none follows any later bracket either.
 */
function hasInlineBracket(line) {
  let open = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      i++;
      continue;
    }
    if (line[i] === '[') {
      open = i;
      break;
    }
  }
  return open !== -1 && line.indexOf(']', open + 1) !== -1;
}

/**
 * Where a label's delimiter colon run ends, so a chord is never spliced into a
 * label. 0 when the line opens with no label.
 *
 * The converter's own simplified reading of the parser's colon-run rule: the
 * FIRST colon run decides, and it is a delimiter only when a space or the end of
 * the line follows it.
 */
function labelEnd(line) {
  let i = 0;
  while (i < line.length && WS.has(line[i])) i++;
  if (i >= line.length || line[i] === ':') return 0; // an empty label is not one
  const colon = line.indexOf(':', i);
  if (colon === -1) return 0;
  let end = colon;
  while (end < line.length && line[end] === ':') end++;
  return end === line.length || WS.has(line[end]) ? end : 0;
}

// A row of guitar tablature is not a lyric, and splicing a chord into one turns a
// readable diagram into rubble. `e|--1---3--|`, `B|--0--|`, and the bare `|---|`.
const TAB_BODY = new Set([...'-0123456789|hpb/\\~* \t\r\f\v']);

function isTabRow(line) {
  let i = 0;
  while (i < line.length && WS.has(line[i])) i++;
  if (i < line.length && /[a-gA-G]/.test(line[i])) i++;
  while (i < line.length && WS.has(line[i])) i++;
  if (line[i] !== '|') return false;
  for (i++; i < line.length; i++) if (!TAB_BODY.has(line[i])) return false;
  return true;
}

/**
 * A ChordPro directive line as `{ key, value }`, or null.
 *
 * `{title:}`/`{artist:}` carry the same meaning as `*`/`**`, so they convert
 * cleanly. The block markers (`{start_of_chorus}` etc.) have no Achordeon
 * equivalent — blocks are separated by blank lines — so they are dropped rather
 * than left to render as stray words. Anything else is left alone and reported by
 * NAME, never by content.
 */
function directiveOf(line) {
  const text = line.trim();
  if (text.length < 3 || text[0] !== '{' || text[text.length - 1] !== '}')
    return null;
  let i = 1;
  const end = text.length - 1;
  while (i < end && WS.has(text[i])) i++;
  const keyStart = i;
  while (i < end && /[a-zA-Z_]/.test(text[i])) i++;
  if (i === keyStart) return null;
  const key = text.slice(keyStart, i).toLowerCase();
  while (i < end && WS.has(text[i])) i++;
  if (i === end) return { key, value: '' };
  if (text[i] !== ':') return null; // `{a b}` is not a directive
  return { key, value: text.slice(i + 1, end).trim() };
}

const TITLE_KEYS = new Set(['title', 't']);
const SUBTITLE_KEYS = new Set(['subtitle', 'st', 'artist']);
const DROP_RE = /^(?:start_of_|end_of_|so|eo)/;

// --- column arithmetic ----------------------------------------------------

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

function splice(chordTokens, lyric, report) {
  const map = columnIndex(lyric);
  const lastCol = map.length - 1;
  const firstWord = lyric.search(/\S/);
  const floor = Math.max(firstWord === -1 ? 0 : firstWord, labelEnd(lyric));
  if (hasInlineBracket(lyric)) report.inlineTargets++;

  // Group by the index the chord will actually land at: several chords clamped to
  // the same spot become one bracket, which is exactly how Achordeon writes them.
  const groups = new Map();
  for (const t of chordTokens) {
    let at;
    if (t.col >= lastCol) {
      at = lyric.length; // chord hangs past the end of the words
      report.clamped++;
    } else {
      at = map[t.col];
    }
    if (at < floor) {
      at = floor; // never inside a label, never before the first word
      report.clamped++;
    }
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(t.text);
    report.chordsPlaced++;
  }

  // Right to left, so an insertion never shifts an index still to be used.
  let out = lyric;
  for (const at of [...groups.keys()].sort((a, b) => b - a)) {
    const bracket = `[${groups.get(at).join(' ')}]`;
    out = out.slice(0, at) + bracket + out.slice(at);
  }
  return out;
}

/** Drop a leading byte-order mark, which a text editor may have left on the file. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Convert somebody else's chord sheet into Achordeon markup.
 *
 * @param {string} text the whole file
 * @param {{ theory: Theory, tabWidth?: number }} options
 * @returns {{ text: string, report: ConversionReport }}
 */
export function toAchordeon(text, options) {
  const theory = options?.theory;
  if (!theory) throw new TypeError('toAchordeon needs a chord theory');
  const tabWidth = options.tabWidth ?? 8;
  if (!Number.isInteger(tabWidth) || tabWidth < 1)
    throw new RangeError('tabWidth must be a positive integer');

  /** @type {ConversionReport} */
  const report = {
    linesIn: 0,
    linesOut: 0,
    merged: 0,
    bareRows: 0,
    chordsPlaced: 0,
    alreadyInline: 0,
    inlineTargets: 0,
    clamped: 0,
    promoted: 0,
    confirmed: 0,
    ambiguous: [],
    tabbedLines: 0,
    wasCrlf: false,
    directives: { converted: 0, dropped: 0, kept: [] },
  };

  let source = stripBom(text);
  report.wasCrlf = /\r\n/.test(source);
  source = source.replace(/\r\n?/g, '\n');

  const lines = source.split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    report.tabbedLines++;
    let out = '';
    for (const ch of line) {
      if (ch === '\t') out += ' '.repeat(tabWidth - (out.length % tabWidth));
      else out += ch;
    }
    return out;
  });
  report.linesIn = lines.length;

  // --- ChordPro directives ------------------------------------------------
  const staged = [];
  const kept = new Set();
  for (const line of lines) {
    const d = directiveOf(line);
    if (!d) {
      staged.push(line);
      continue;
    }
    if (TITLE_KEYS.has(d.key) && d.value) {
      staged.push(`* ${d.value}`);
      report.directives.converted++;
    } else if (SUBTITLE_KEYS.has(d.key) && d.value) {
      staged.push(`** ${d.value}`);
      report.directives.converted++;
    } else if (DROP_RE.test(d.key)) {
      report.directives.dropped++;
    } else {
      staged.push(line);
      kept.add(d.key);
    }
  }
  report.directives.kept = [...kept];

  // --- merge --------------------------------------------------------------
  const rows = staged.map((line) => chordRow(line, theory));
  // Does this file demonstrably use the chords-above-lyrics layout? One
  // unambiguous chord row is proof enough. That is what settles the one-letter
  // rows: in a file already full of chord rows, an `F` on its own line above a
  // line of words is a chord — reading it as a lyric would silently drop half the
  // song's chords. In a file with no chord rows at all, nothing licenses that
  // reading, so it stands.
  report.confirmed = rows.filter((r) => r && !r.ambiguous).length;

  const result = [];
  for (let i = 0; i < staged.length; i++) {
    const line = staged[i];

    if (hasInlineBracket(line)) {
      report.alreadyInline++;
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

    // A line that already carries brackets is still a merge target: `splice`
    // counts printed columns, so an `[x2]` annotation does not shift the chords
    // over it.
    const next = staged[i + 1];
    const nextIsLyric =
      next !== undefined &&
      next.trim() !== '' &&
      !rows[i + 1] &&
      !/^\s*\*/.test(next) &&
      !isTabRow(next);

    if (row.ambiguous && !(report.confirmed > 0 && nextIsLyric)) {
      // Numbered in the OUTPUT, the file the reader opens.
      report.ambiguous.push(result.length + 1);
      result.push(line);
      continue;
    }
    if (row.ambiguous) report.promoted++;

    if (nextIsLyric) {
      result.push(splice(row.tokens, next, report));
      report.merged++;
      i++; // the lyric line has been consumed into the merged line
    } else {
      // Intro, solo, turnaround: a row of chords with no words under it.
      // Achordeon renders a bracket-only line in the line, at lyric size — which
      // is the look.
      result.push(`[${row.tokens.map((t) => t.text).join(' ')}]`);
      report.bareRows++;
    }
  }
  report.linesOut = result.length;

  let out = result.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return { text: out, report };
}
