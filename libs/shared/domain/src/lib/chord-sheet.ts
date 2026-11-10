// Chord sheet ⇄ Achordeon — plans/import-chord-sheets.md, phase 1
// Glossary: Chord sheet, Song draft, Dialect (CONTEXT.md).

import type { Block, ChordAnchor, Line } from './ast';
import type { ChordNotation } from './chords';
import { parse } from './parser';
import type { ChordTheory } from './theory';

/** The two shapes a Chord sheet comes in. */
export type ChordSheetFormat = 'chordpro' | 'chord-rows';

/** What the caller already knows or the user confirmed. Everything is optional. */
export interface ChordSheetChoices {
  /** The Dialect the sheet is written in. Omitted: the guess is used. */
  readonly dialect?: ChordNotation;
  /** Skips detection: the text is converted as this format even if it would not be detected. */
  readonly format?: ChordSheetFormat;
  /** Used only where the text carries no title of its own. */
  readonly title?: string;
  /** Used only where the text carries no artist of its own. */
  readonly artist?: string;
  /** Tab stop width for aligning chord rows. Default 8. */
  readonly tabWidth?: number;
}

/** Counts, line numbers and directive names. Never a line of the song. */
export interface ConversionReport {
  readonly linesIn: number;
  readonly linesOut: number;
  readonly merged: number;
  readonly bareRows: number;
  readonly chordsPlaced: number;
  readonly alreadyInline: number;
  readonly inlineTargets: number;
  readonly clamped: number;
  readonly promoted: number;
  readonly confirmed: number;
  /** 1-based line numbers in the draft's Content, left for a human. */
  readonly ambiguous: readonly number[];
  readonly respelled: number;
  readonly tabbedLines: number;
  readonly wasCrlf: boolean;
  readonly directives: {
    readonly converted: number;
    /** Names of the directives that had nothing to become. */
    readonly dropped: readonly string[];
  };
}

/** One Song from a Chord sheet, not saved anywhere yet. */
export interface SongDraft {
  /** "Title – Artist", "Title", or null when the sheet names nothing. */
  readonly name: string | null;
  readonly content: string;
  readonly report: ConversionReport;
}

export interface NotAChordSheet {
  readonly kind: 'not-a-chord-sheet';
}

export interface ConvertedChordSheet {
  readonly kind: 'converted';
  readonly format: ChordSheetFormat;
  readonly dialect: ChordNotation;
  readonly guessedDialect: ChordNotation;
  /** The whole sheet as one Content, every song joined. */
  readonly content: string;
  /** One draft per song in the sheet; always at least one. */
  readonly songs: readonly SongDraft[];
}

export type ChordSheetConversion = NotAChordSheet | ConvertedChordSheet;

// --- report ---------------------------------------------------------------

/** The report while it is being written; frozen into a ConversionReport. */
interface Tally {
  linesIn: number;
  linesOut: number;
  merged: number;
  bareRows: number;
  chordsPlaced: number;
  alreadyInline: number;
  inlineTargets: number;
  clamped: number;
  promoted: number;
  confirmed: number;
  ambiguous: number[];
  respelled: number;
  tabbedLines: number;
  wasCrlf: boolean;
  converted: number;
  dropped: string[];
}

function emptyTally(): Tally {
  return {
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
    respelled: 0,
    tabbedLines: 0,
    wasCrlf: false,
    converted: 0,
    dropped: [],
  };
}

function freeze(t: Tally): ConversionReport {
  const { converted, dropped, ...counts } = t;
  return { ...counts, directives: { converted, dropped } };
}

// --- token classification -------------------------------------------------
// A token is "chordish" if the theory calls it a chord, or if it is one of the
// annotations that legitimately share a chord row: bar lines, repeat marks, N.C.

const BAR_RE = /^[|:/%()[\].,\-–—]+$/;
const REPEAT_RE = /^\(?\d*\s*[xX×]\s*\d*\)?$/;
const NC_RE = /^\(?N\.?\s?C\.?\)?$/i;

interface Token {
  readonly text: string;
  readonly col: number;
}

interface ChordRow {
  readonly tokens: readonly Token[];
  /** A one-letter row: a chord, or a one-word lyric. The rest of the sheet decides. */
  readonly ambiguous: boolean;
}

/** Strip the wrapping a chord symbol picks up in the wild: (Am),  Am,  "Am". */
function core(token: string): string {
  return token.replace(/^[("']+/, '').replace(/[)"',;]+$/, '');
}

function tokensOf(line: string): Token[] {
  const out: Token[] = [];
  for (const m of line.matchAll(/\S+/g)) {
    out.push({ text: m[0], col: m.index ?? 0 });
  }
  return out;
}

/** All tokens chordish and at least one a real chord, or null. */
function chordRow(
  line: string,
  isChord: (t: string) => boolean,
): ChordRow | null {
  const tokens = tokensOf(line);
  if (tokens.length === 0) {
    return null;
  }
  let real = 0;
  for (const t of tokens) {
    const c = core(t.text);
    if (c && isChord(c)) {
      real++;
    } else if (
      !BAR_RE.test(t.text) &&
      !REPEAT_RE.test(t.text) &&
      !NC_RE.test(t.text)
    ) {
      return null;
    }
  }
  if (real === 0) {
    return null;
  }
  return {
    tokens,
    ambiguous: tokens.length === 1 && core(tokens[0].text).length < 2,
  };
}

// --- linear scanners ------------------------------------------------------
// The input is arbitrary text off the internet: no backtracking patterns over it.

const WS = new Set([' ', '\t']);

/** Does this line already carry an unescaped `[…]`? */
function hasInlineBracket(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      i++;
      continue;
    }
    if (line[i] === '[') {
      return line.indexOf(']', i + 1) !== -1;
    }
  }
  return false;
}

/** Where a label's delimiter colon run ends; 0 when the line opens with no label. */
function labelEnd(line: string): number {
  let i = 0;
  while (i < line.length && WS.has(line[i])) i++;
  if (i >= line.length || line[i] === ':') {
    return 0;
  }
  const colon = line.indexOf(':', i);
  if (colon === -1) {
    return 0;
  }
  let end = colon;
  while (end < line.length && line[end] === ':') end++;
  return end === line.length || WS.has(line[end]) ? end : 0;
}

const TAB_BODY = new Set([...'-0123456789|hpb/\\~* \t\r\f\v']);

/** A row of guitar tablature: `e|--1---3--|`, `B|--0--|`, `|---|`. */
function isTabRow(line: string): boolean {
  let i = 0;
  while (i < line.length && WS.has(line[i])) i++;
  if (i < line.length && /[a-gA-G]/.test(line[i])) i++;
  while (i < line.length && WS.has(line[i])) i++;
  if (line[i] !== '|') {
    return false;
  }
  for (i++; i < line.length; i++) {
    if (!TAB_BODY.has(line[i])) {
      return false;
    }
  }
  return true;
}

interface Directive {
  readonly key: string;
  readonly value: string;
}

/** A ChordPro directive line as key and value, or null. */
function directiveOf(line: string): Directive | null {
  const text = line.trim();
  if (text.length < 3 || text[0] !== '{' || text[text.length - 1] !== '}') {
    return null;
  }
  const end = text.length - 1;
  let i = 1;
  while (i < end && WS.has(text[i])) i++;
  const keyStart = i;
  while (i < end && /[a-zA-Z_]/.test(text[i])) i++;
  if (i === keyStart) {
    return null;
  }
  const key = text.slice(keyStart, i).toLowerCase();
  while (i < end && WS.has(text[i])) i++;
  if (i === end) {
    return { key, value: '' };
  }
  if (text[i] !== ':') {
    return null;
  }
  return { key, value: text.slice(i + 1, end).trim() };
}

const KNOWN_DIRECTIVES = new Set([
  'title',
  't',
  'subtitle',
  'st',
  'sorttitle',
  'artist',
  'composer',
  'lyricist',
  'arranger',
  'album',
  'year',
  'copyright',
  'key',
  'capo',
  'tempo',
  'time',
  'duration',
  'meta',
  'comment',
  'c',
  'comment_italic',
  'ci',
  'comment_box',
  'cb',
  'highlight',
  'chorus',
  'new_song',
  'ns',
  'soc',
  'eoc',
  'sov',
  'eov',
  'sob',
  'eob',
  'sot',
  'eot',
  'sog',
  'eog',
]);

function isKnownDirective(d: Directive | null): d is Directive {
  return (
    d !== null &&
    (KNOWN_DIRECTIVES.has(d.key) ||
      d.key.startsWith('start_of_') ||
      d.key.startsWith('end_of_'))
  );
}

function isTitleMarker(line: string): boolean {
  return /^\s*\*/.test(line);
}

// --- column arithmetic ----------------------------------------------------

/**
 * Printed column → string index. A bracket run takes no width on the page, so a
 * line that already carries brackets still aligns with the chord row above it.
 * One entry per printed column, plus one past the end.
 */
function columnIndex(line: string): number[] {
  const map: number[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length) {
      map.push(i);
      i += 2;
      continue;
    }
    if (line[i] === '[') {
      let depth = 0;
      while (i < line.length) {
        if (line[i] === '[') {
          depth++;
        } else if (line[i] === ']' && --depth === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    map.push(i);
    i++;
  }
  map.push(line.length);
  return map;
}

function splice(chords: readonly Token[], lyric: string, tally: Tally): string {
  const map = columnIndex(lyric);
  const lastCol = map.length - 1;
  const firstWord = lyric.search(/\S/);
  const floor = Math.max(firstWord === -1 ? 0 : firstWord, labelEnd(lyric));
  if (hasInlineBracket(lyric)) {
    tally.inlineTargets++;
  }

  // Several chords landing on one spot become one bracket.
  const groups = new Map<number, string[]>();
  for (const t of chords) {
    let at: number;
    if (t.col >= lastCol) {
      at = lyric.length;
      tally.clamped++;
    } else {
      at = map[t.col];
    }
    if (at < floor) {
      at = floor;
      tally.clamped++;
    }
    const group = groups.get(at) ?? [];
    group.push(t.text);
    groups.set(at, group);
    tally.chordsPlaced++;
  }

  // Right to left, so an insertion never shifts an index still to be used.
  let out = lyric;
  for (const at of [...groups.keys()].sort((a, b) => b - a)) {
    out = `${out.slice(0, at)}[${(groups.get(at) ?? []).join(' ')}]${out.slice(at)}`;
  }
  return out;
}

// --- dialect --------------------------------------------------------------
// A German sheet spells B natural `H` and B♭ `B`, sharps `-is`, flats `-es`/`-s`,
// and minor `mi`. Content is always English (NOTATION-PLAN §4): the rewrite
// happens here, once, and the Dialect is never stored.

function germanNote(
  letter: string,
  acc: string | undefined,
  rest: string,
): string {
  if (acc === 's' && rest.startsWith('us')) {
    return letter === 'H' ? 'B' : letter === 'B' ? 'Bb' : letter; // Asus4, not As
  }
  const base = letter === 'H' ? 'B' : letter === 'B' ? 'Bb' : letter;
  switch (acc) {
    case 'is':
    case '#':
      return letter === 'B' ? 'B' : `${base}#`;
    case 'es':
    case 's':
    case 'b':
      return letter === 'B' ? 'Bb' : `${base}b`;
    default:
      return base;
  }
}

/** One German chord symbol in English: root and `/bass`, then `mi` → `m`. */
function englishChord(token: string): string {
  return token
    .replace(
      /(^|\/)([A-H])(is|es|s|#|b)?/g,
      (
        m: string,
        pre: string,
        letter: string,
        acc: string | undefined,
        offset: number,
        whole: string,
      ) => {
        const rest = whole.slice(offset + m.length);
        const keptS = acc === 's' && rest.startsWith('us') ? 's' : '';
        return pre + germanNote(letter, acc, rest) + keptS;
      },
    )
    .replace(/^([A-G][#b]?)mi(?![nj])/, '$1m');
}

const GERMAN_EVIDENCE = [/(?:^|\/)H/, /^[A-H](?:is|es|s)?mi(?![nj])/];

function looksGerman(token: string): boolean {
  return GERMAN_EVIDENCE.some((re) => re.test(token));
}

/** One German chord token in English, where that makes it a chord; else as it was. */
function germanToken(token: string, theory: ChordTheory): string {
  const english = englishChord(token);
  return english !== token && theory.parseChord(english) !== null
    ? english
    : token;
}

/**
 * Rewrite every token inside the line's unescaped brackets with `respell`.
 * A `\[` is text, and a `[` with no `]` after it opens nothing.
 */
function respellBracketsIn(
  line: string,
  respell: (token: string) => string,
): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') {
      out += line.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === '[') {
      const close = line.indexOf(']', i + 1);
      if (close === -1) {
        return out + line.slice(i);
      }
      const inner = line.slice(i + 1, close).replace(/[^\s,[\]]+/g, respell);
      out += `[${inner}]`;
      i = close + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Every chord in `content` read as German and written in English: `H` → `B`,
 * `B` → `Bb`, `Fis` → `F#`, `Es` → `Eb`, `mi` → `m`. Only inside brackets, and
 * not on a title line, where a bracket is text. The words are not touched.
 *
 * For Content already in Achordeon that was typed or pasted in German — the
 * caller says it is German; nothing here guesses.
 */
export function germanChordsToEnglish(
  content: string,
  theory: ChordTheory,
): string {
  return content
    .split('\n')
    .map((line) =>
      isTitleMarker(line)
        ? line
        : respellBracketsIn(line, (token) => germanToken(token, theory)),
    )
    .join('\n');
}

/** Every chord token written inside brackets on a line. */
function bracketTokens(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\[([^\]]*)\]/g)) {
    out.push(...(m[1].match(/[^\s,[\]]+/g) ?? []));
  }
  return out;
}

// --- input ----------------------------------------------------------------

function normalise(
  text: string,
  tabWidth: number,
): { lines: string[]; wasCrlf: boolean; tabbed: Set<number> } {
  let source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const wasCrlf = source.includes('\r\n');
  source = source.replace(/\r\n?/g, '\n');
  if (source.endsWith('\n')) {
    source = source.slice(0, -1);
  }
  const tabbed = new Set<number>();
  const lines = source.split('\n').map((line, index) => {
    if (!line.includes('\t')) {
      return line;
    }
    tabbed.add(index);
    let out = '';
    for (const ch of line) {
      out += ch === '\t' ? ' '.repeat(tabWidth - (out.length % tabWidth)) : ch;
    }
    return out;
  });
  return { lines, wasCrlf, tabbed };
}

// --- one song -------------------------------------------------------------

/**
 * Outside brackets, a `: ` would turn a lyric into a label and a `*` at the
 * start into a title. In ChordPro the labels come from directives, so both are
 * escaped in the words.
 */
function escapeLyric(line: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
    }
    if (
      depth === 0 &&
      ch === ':' &&
      (i + 1 === line.length || WS.has(line[i + 1]))
    ) {
      out += '\\:';
    } else if (i === 0 && ch === '*') {
      out += '\\*';
    } else {
      out += ch;
    }
  }
  return out;
}

/** `1. ` opening a line: a chord-rows sheet's verse number. */
const VERSE_NUMBER = /^(\d+\.) (?=\S)/;

/**
 * A chord-rows line as Achordeon writes it: its verse number a label, and the
 * indent that lined the words up under that number gone. The indent is spacing
 * the page never shows (Phase 1 strips it); it only cluttered the editor. Run
 * after the chords are spliced, which need the columns the indent kept.
 */
function asWritten(line: string): string {
  let start = 0;
  while (start < line.length && WS.has(line[start])) start++;
  return line.slice(start).replace(VERSE_NUMBER, '$1: ');
}

const TITLE_KEYS = new Set(['title', 't']);
const SUBTITLE_KEYS = new Set(['subtitle', 'st']);
const COMMENT_KEYS = new Set([
  'comment',
  'c',
  'comment_italic',
  'ci',
  'comment_box',
  'cb',
  'highlight',
]);
const SECTION_START = /^(?:start_of_[a-z_]+|so[cvbtg])$/;
const SECTION_END = /^(?:end_of_[a-z_]+|eo[cvbtg])$/;
const CHORUS_START = new Set(['start_of_chorus', 'soc']);
/** The label a chorus reference gets when no chorus before it had one. */
const DEFAULT_CHORUS_LABEL = 'R';

interface SongMeta {
  title?: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  capo?: string;
}

/** `{chorus}`, `{chorus: Label}` or `{chorus: R: text}` as one Achordeon block. */
function chorusReference(value: string, lastChorusLabel: string): string {
  if (!value) {
    return `${lastChorusLabel}:`;
  }
  const colon = value.indexOf(': ');
  if (colon > 0) {
    return `${value.slice(0, colon)}: ${escapeLyric(value.slice(colon + 2).trim())}`;
  }
  return `${value}:`;
}

interface SongInput {
  readonly lines: readonly string[];
  readonly rows: readonly (ChordRow | null)[];
  readonly tabbedLines: number;
}

interface SongContext {
  readonly layoutProven: boolean;
  readonly wasCrlf: boolean;
  /** ChordPro: labels come from directives, so colons in the words are escaped. */
  readonly isChordPro: boolean;
  /** Set when the sheet is German: rewrites one chord token into English. */
  readonly respell: ((token: string) => string) | null;
  readonly fallbackTitle?: string;
  readonly fallbackArtist?: string;
}

function convertSong(song: SongInput, ctx: SongContext): SongDraft {
  const tally = emptyTally();
  tally.linesIn = song.lines.length;
  tally.tabbedLines = song.tabbedLines;
  tally.wasCrlf = ctx.wasCrlf;
  tally.confirmed = song.rows.filter((r) => r && !r.ambiguous).length;

  const { lines, rows } = song;
  const meta: SongMeta = {};
  const body: string[] = [];
  /** Indexes into `body` of the lines left for a human. */
  const ambiguous: number[] = [];

  let label: string | null = null;
  let blockHasLines = false;
  let lastChorusLabel = DEFAULT_CHORUS_LABEL;

  const breakBlock = () => {
    if (label !== null && !blockHasLines) {
      body.push(`${label}:`);
    }
    label = null;
    blockHasLines = false;
    if (body.length > 0 && body[body.length - 1] !== '') {
      body.push('');
    }
  };
  const respellBrackets = (line: string): string => {
    const respell = ctx.respell;
    if (!respell) {
      return line;
    }
    return respellBracketsIn(line, (token) => {
      const next = respell(token);
      if (next !== token) {
        tally.respelled++;
      }
      return next;
    });
  };
  const pushLine = (raw: string) => {
    const line = respellBrackets(raw);
    const words = ctx.isChordPro ? escapeLyric(line) : asWritten(line);
    body.push(label !== null && !blockHasLines ? `${label}: ${words}` : words);
    blockHasLines = true;
  };
  const drop = (key: string) => {
    if (!tally.dropped.includes(key)) {
      tally.dropped.push(key);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const d = directiveOf(line);
    if (d) {
      const { key, value } = d;
      if (TITLE_KEYS.has(key) && value) {
        meta.title = value;
      } else if (SUBTITLE_KEYS.has(key) && value) {
        meta.subtitle = value;
      } else if (key === 'artist' && value) {
        meta.artist = value;
      } else if (key === 'key' && value) {
        meta.key = value;
      } else if (key === 'capo' && value) {
        meta.capo = value;
      } else if (SECTION_START.test(key)) {
        breakBlock();
        label = value || null;
        if (CHORUS_START.has(key) && value) {
          lastChorusLabel = value;
        }
      } else if (SECTION_END.test(key)) {
        breakBlock();
      } else if (COMMENT_KEYS.has(key) && value) {
        breakBlock();
        label = value;
      } else if (key === 'chorus') {
        breakBlock();
        body.push(chorusReference(value, lastChorusLabel));
        blockHasLines = true;
        breakBlock();
      } else {
        drop(key);
        continue;
      }
      tally.converted++;
      continue;
    }

    if (line.trim() === '') {
      if (blockHasLines) {
        breakBlock();
      }
      continue;
    }

    if (hasInlineBracket(line)) {
      tally.alreadyInline++;
      pushLine(line);
      continue;
    }
    const row = isTitleMarker(line) ? null : rows[i];
    if (!row) {
      pushLine(line);
      continue;
    }
    const next = lines[i + 1];
    const nextIsLyric =
      next !== undefined &&
      next.trim() !== '' &&
      !rows[i + 1] &&
      directiveOf(next) === null &&
      !isTitleMarker(next) &&
      !isTabRow(next);

    if (row.ambiguous && !(ctx.layoutProven && nextIsLyric)) {
      ambiguous.push(body.length);
      pushLine(line);
      continue;
    }
    if (row.ambiguous) {
      tally.promoted++;
    }
    if (nextIsLyric) {
      pushLine(splice(row.tokens, next, tally));
      tally.merged++;
      i++;
    } else {
      pushLine(`[${row.tokens.map((t) => t.text).join(' ')}]`);
      tally.bareRows++;
    }
  }
  breakBlock();
  while (body.length > 0 && body[body.length - 1] === '') {
    body.pop();
  }

  const title = meta.title ?? ctx.fallbackTitle;
  const artist = meta.artist ?? ctx.fallbackArtist;
  const subtitle = meta.subtitle ?? artist;
  const head: string[] = [];
  if (title) {
    head.push(`* ${title}`);
  }
  if (subtitle) {
    head.push(`** ${subtitle}`);
  }
  const playing = [
    meta.key ? `Key ${meta.key}` : null,
    meta.capo ? `Capo ${meta.capo}` : null,
  ].filter((part) => part !== null);
  if (playing.length > 0) {
    head.push(escapeLyric(playing.join(', ')));
  }

  const out = [...head, ...body];
  tally.ambiguous = ambiguous.map((index) => index + head.length + 1);
  tally.linesOut = out.length;
  const name = title ? (artist ? `${title} – ${artist}` : title) : null;
  return { name, content: `${out.join('\n')}\n`, report: freeze(tally) };
}

// --- detection ------------------------------------------------------------

/** How many chord rows it takes, each above words, to call text a sheet. */
const ROWS_TO_DETECT = 2;

/**
 * ChordPro when any line is a directive ChordPro defines; chord rows when enough
 * unmistakable chord rows sit above words; otherwise null — not a chord sheet.
 */
function detect(
  lines: readonly string[],
  rows: readonly (ChordRow | null)[],
): ChordSheetFormat | null {
  if (lines.some((line) => isKnownDirective(directiveOf(line)))) {
    return 'chordpro';
  }
  let above = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const row = rows[i];
    const next = lines[i + 1];
    if (row && !row.ambiguous && !rows[i + 1] && next.trim() !== '') {
      above++;
    }
  }
  return above >= ROWS_TO_DETECT ? 'chord-rows' : null;
}

// --- entry ----------------------------------------------------------------

export function convertChordSheet(
  text: string,
  theory: ChordTheory,
  choices: ChordSheetChoices = {},
): ChordSheetConversion {
  const tabWidth = choices.tabWidth ?? 8;
  if (!Number.isInteger(tabWidth) || tabWidth < 1) {
    throw new RangeError('tabWidth must be a positive integer');
  }
  // Either reading counts as a chord here: the Dialect is not known yet, and a
  // German `Fis` row is still a row of chords.
  const isChord = (t: string) =>
    theory.parseChord(t) !== null ||
    theory.parseChord(englishChord(t)) !== null;

  const { lines, wasCrlf, tabbed } = normalise(text, tabWidth);
  const rows = lines.map((line) => chordRow(line, isChord));
  const layoutProven = rows.some((r) => r && !r.ambiguous);

  const format = choices.format ?? detect(lines, rows);
  if (format === null) {
    return { kind: 'not-a-chord-sheet' };
  }

  const chordTokens = lines.flatMap((line, i) => [
    ...(rows[i]?.tokens.map((t) => core(t.text)) ?? []),
    ...bracketTokens(line),
  ]);
  const guessedDialect: ChordNotation = chordTokens.some(looksGerman)
    ? 'german'
    : 'english';
  const dialect = choices.dialect ?? guessedDialect;
  const respell =
    dialect === 'german' ? (token: string) => germanToken(token, theory) : null;

  const ctx: SongContext = {
    layoutProven,
    wasCrlf,
    isChordPro: format === 'chordpro',
    respell,
    fallbackTitle: choices.title,
    fallbackArtist: choices.artist,
  };
  const songs = splitSongs(lines, rows, tabbed).map((song) =>
    convertSong(song, ctx),
  );
  return {
    kind: 'converted',
    format,
    dialect,
    guessedDialect,
    content: songs.map((s) => s.content).join('\n'),
    songs,
  };
}

const NEW_SONG = new Set(['new_song', 'ns']);

/** Cut the sheet at `{new_song}`; a section with nothing in it is no song. */
function splitSongs(
  lines: readonly string[],
  rows: readonly (ChordRow | null)[],
  tabbed: ReadonlySet<number>,
): SongInput[] {
  const songs: SongInput[] = [];
  let start = 0;
  const close = (end: number) => {
    const section = lines.slice(start, end);
    if (section.some((line) => line.trim() !== '')) {
      let tabbedLines = 0;
      for (let i = start; i < end; i++) {
        if (tabbed.has(i)) tabbedLines++;
      }
      songs.push({ lines: section, rows: rows.slice(start, end), tabbedLines });
    }
  };
  lines.forEach((line, i) => {
    const d = directiveOf(line);
    if (d && NEW_SONG.has(d.key)) {
      close(i);
      start = i + 1;
    }
  });
  close(lines.length);
  if (songs.length === 0) {
    songs.push({ lines, rows, tabbedLines: tabbed.size });
  }
  return songs;
}

// --- ChordPro out ---------------------------------------------------------
// Read through the real parser (ADR-0005), never a second grammar. Lossy by
// design: render settings, emphasis and where a label sat stay behind.

/** A label that names a chorus, in the languages songbooks write it in. */
const CHORUS_LABEL = /^(?:r|ref|refr[eé]n|refrain|chorus)\.?\s*\d*\.?$/i;

function chordProLine(line: Line): string {
  const text = line.text;
  const groups = new Map<number, ChordAnchor[]>();
  for (const anchor of line.chords) {
    const group = groups.get(anchor.at) ?? [];
    group.push(anchor);
    groups.set(anchor.at, group);
  }
  let out = text;
  for (const at of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(at) ?? [];
    const spaced = text.trim() === '' || group.some((a) => a.inline);
    const chords = group.map((a) => `[${a.raw}]`).join(spaced ? ' ' : '');
    out = out.slice(0, at) + chords + out.slice(at);
  }
  return out;
}

function chordProBlock(block: Block): string[] {
  const label = block.label;
  if (label !== undefined && block.lines.length === 0) {
    return [
      CHORUS_LABEL.test(label) ? `{chorus: ${label}}` : `{comment: ${label}}`,
    ];
  }
  const lines: string[] = [];
  for (const line of block.lines) {
    if (line.label !== undefined) {
      lines.push(`{comment: ${line.label}}`);
    }
    lines.push(chordProLine(line));
  }
  if (label === undefined) {
    return lines;
  }
  if (CHORUS_LABEL.test(label)) {
    return [`{start_of_chorus: ${label}}`, ...lines, '{end_of_chorus}'];
  }
  return [`{comment: ${label}}`, ...lines];
}

function chordProSong(content: string, theory: ChordTheory): string {
  const ast = parse(content, theory);
  const head: string[] = [];
  if (ast.title !== undefined) {
    head.push(`{title: ${ast.title}}`);
  }
  if (ast.subtitle !== undefined) {
    head.push(`{subtitle: ${ast.subtitle}}`);
  }
  const blocks = ast.blocks.map((b) => chordProBlock(b).join('\n'));
  const parts = head.length > 0 ? [head.join('\n'), ...blocks] : blocks;
  return `${parts.join('\n\n')}\n`;
}

export function toChordPro(
  songs: readonly { readonly content: string }[],
  theory: ChordTheory,
): string {
  return songs
    .map((song) => chordProSong(song.content, theory))
    .join('\n{new_song}\n');
}
