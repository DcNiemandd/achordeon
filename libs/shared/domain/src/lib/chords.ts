// Shared chord sub-grammar helpers — Epic 2
// Spec: docs/PARSER-GRAMMAR.md §Phase 2, §Escapes, §No nesting. One bracket
// recogniser feeds both the Phase-2 inline scan and `transposeContent`.

/**
 * Chars a backslash makes literal (PARSER-GRAMMAR §Escapes). `\\` → one `\`.
 *
 * `]` is escapable too, for symmetry with `[`: writing a literal bracketed word
 * in a lyric reads as `\[word\]`, and if only `[` were escapable the trailing
 * `\]` would keep its backslash — the escape character left stranded in the
 * output. `\[word]` alone also works (no open bracket, so the `]` is already
 * literal), but nobody escapes one bracket and not the other.
 *
 * **Space is escapable so a leading space can be kept.** Phase 1 strips a content
 * line's leading whitespace (it is almost always the editor's accidental indent),
 * so `\ ` is the way to say "this leading space is deliberate" — the strip stops
 * at the backslash and Phase 2 resolves `\ ` back to a bare space. A space
 * mid-line never needs escaping; `\ ` there just renders a space like any other.
 */
export const ESCAPABLE = new Set([':', '*', '[', ']', '\\', ' ']);

/**
 * Which language chord note names are spelled in.
 *
 * A **rendering** choice, resolved through the settings cascade like any other
 * (ADR-0006) and applied by `respellChords` (notation.ts). Reading is unaffected:
 * `toEnglishNotation` accepts `H` whatever this says, so no song stops parsing
 * because of it.
 */
export type ChordNotation = 'english' | 'german';

/**
 * Rewrite German note names to English, so the one English-based chord engine
 * recognises them (ADR-0008: the engine is quarantined; notation policy is the
 * domain's).
 *
 * **Reading, not writing** — the `notation` setting spells chords on the way
 * *out* (notation.ts); this is the way *in*, and it is unconditional. `H` → `B`
 * natural, and nothing else: the common *mixed* convention, where `B` stays B
 * natural and `H` is simply the extra name for it, so no English chord changes
 * meaning and `[H]` never reads as a grey annotation. It rewrites a **leading**
 * `H` (the root) and an `H` right after the `/` (the bass); a quality never
 * starts with a note letter, so the middle is untouched.
 *
 * That the two halves are asymmetric is the point: what a source file *means*
 * must not depend on a preference, or the same song would sound different on two
 * devices and a transpose would bake the difference in.
 *
 * **Still deferred:** the solfège spellings `Cis`/`Des`/`As`/`Es`, and strict
 * German where a bare `B` in the *source* means B♭.
 *
 * One helper, shared by every `ChordTheory` (the tonal adapter and the fake), so
 * the two can never drift on which symbols are valid.
 */
export function toEnglishNotation(chord: string): string {
  return chord.replace(/(^|\/)H/g, '$1B');
}

/**
 * Index of the closing `]` for a bracket opened at `open`, or -1 if unterminated.
 * A backslash escapes the next char, so `\]` does not close and `\\` is skipped
 * (no nesting: everything up to the first unescaped `]` is chord content).
 */
export function findClosingBracket(s: string, open: number): number {
  for (let j = open + 1; j < s.length; j++) {
    if (s[j] === '\\') {
      j++; // skip the escaped char
      continue;
    }
    if (s[j] === ']') {
      return j;
    }
  }
  return -1;
}

/**
 * Index of the first `]` of the `]]` that closes an INLINE chord group opened at
 * `open` (which points at the first of its two `[`), or -1 if unterminated.
 *
 * Same escape rule as {@link findClosingBracket} — `\]` does not close — and the
 * same no-nesting rule: everything up to the first unescaped `]]` is the group's
 * content, so a lone `]` inside one is just a character. Unterminated is not an
 * error: the caller falls back to treating the first `[` as literal text, exactly
 * as it does for a lone unterminated `[`.
 */
export function findClosingDoubleBracket(s: string, open: number): number {
  for (let j = open + 2; j < s.length - 1; j++) {
    if (s[j] === '\\') {
      j++; // skip the escaped char
      continue;
    }
    if (s[j] === ']' && s[j + 1] === ']') {
      return j;
    }
  }
  return -1;
}

/** A chord bracket found in the source: `[…]`, or the doubled `[[…]]`. */
export interface BracketSpan {
  /** Index of the opening `[` — the FIRST of the two when `inline`. */
  start: number;
  /** Index of the closing `]` — the FIRST of the two when `inline`. */
  end: number;
  inline: boolean;
}

/**
 * The chord bracket the caret at `index` sits in, or null when it sits in none.
 *
 * "In" means past the opening bracket(s) and no further than the closing one —
 * the rule the sharp/flat buttons and the Chord button both need, and the reason
 * this is one function: two walks over the same brackets would eventually
 * disagree about which one the caret was in. Escape-aware, and non-nesting, like
 * every other recogniser here.
 */
export function bracketAt(s: string, index: number): BracketSpan | null {
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2; // a `\[` is a literal bracket, not one the caret can be "in"
      continue;
    }
    if (s[i] === '[') {
      const inline = s[i + 1] === '[';
      const close = inline
        ? findClosingDoubleBracket(s, i)
        : findClosingBracket(s, i);
      if (close === -1) {
        i += 1; // unterminated: not a bracket, keep scanning inside it
        continue;
      }
      const open = i + (inline ? 1 : 0);
      if (open < index && index <= close) {
        return { start: i, end: close, inline };
      }
      i = close + (inline ? 2 : 1);
      continue;
    }
    i += 1;
  }
  return null;
}

/** A stretch of asterisks still looking for its other half. */
interface OpenEmphasis {
  /** Index of the first of the asterisks still unspent. */
  at: number;
  remaining: number;
}

/**
 * The emphasis markers on a line (PARSER-GRAMMAR §Emphasis), as **start index →
 * how many asterisks** — one entry per match, on each side of it. Every asterisk
 * the map does not cover is printed text, and one run of `*` can hold both, so the
 * groups are the unit here rather than the runs.
 *
 * Matching runs in two passes, and the second never overrides the first:
 *
 * 1. **Exact.** A closer that can spend exactly what the innermost opener holds
 *    does, and repeats for the next one out; a run that can close nothing opens
 *    with all of its asterisks. This pass is what makes nesting work — the `*` in
 *    `**a *b* c**` opens italic instead of eating one of the bold's asterisks.
 * 2. **Repair.** What never matched pairs up anyway, as far as the shorter side
 *    goes, and only the asterisks left over print. So `***** a as****` spends four
 *    against four and prints the odd one, rather than dumping nine asterisks on the
 *    page because the author typed one too many.
 *
 * A match spends an opener's **rightmost** asterisks and a closer's **leftmost**,
 * so what prints always ends up outside the emphasis, never between the marker and
 * the words it marks.
 *
 * Asterisks that are never matched at all print, which is the whole point: one
 * stray `*` used to italicise everything after it, and demanding `\*` for every
 * footnote mark in a lyric is a trap, not a grammar. **Nothing is required on
 * either side of a marker** either — `* a *` is italic, spaces included, because
 * song text is full of asterisks hugging a space and Markdown's flanking rules
 * would have made that phrase un-emphasisable.
 *
 * `from` skips a label marker, which is plain text that Phase 2 never sees — the
 * returned indices stay absolute in `s`.
 *
 * One recogniser, like `findClosingBracket`: the inline scan resolves emphasis with
 * it and the editor's highlighter colours it with it, so an asterisk cannot print
 * as text in the preview and colour as a marker in the editor.
 */
export function emphasisMarkers(s: string, from = 0): Map<number, number> {
  const markers = new Map<number, number>();
  /** Emphasis opened and not yet closed, innermost last. */
  const open: OpenEmphasis[] = [];

  let i = from;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && ESCAPABLE.has(s[i + 1])) {
      i += 2; // `\*` is a printed asterisk, never a marker
      continue;
    }
    if (s[i] === '[') {
      // Bracket content is chord text, where a `*` means nothing. Unterminated →
      // the `[` is literal and the scan resumes inside it, exactly as Phase 2 does.
      const inline = s[i + 1] === '[';
      const close = inline
        ? findClosingDoubleBracket(s, i)
        : findClosingBracket(s, i);
      i = close === -1 ? i + 1 : close + (inline ? 2 : 1);
      continue;
    }
    if (s[i] === '*') {
      let length = 0;
      while (s[i + length] === '*') {
        length += 1;
      }
      // Spend the run left to right: close the innermost emphasis it can afford
      // in full, then the next one out, for as long as its asterisks last.
      let spent = 0;
      while (spent < length) {
        const innermost = open[open.length - 1];
        if (innermost === undefined || innermost.remaining > length - spent) {
          break;
        }
        open.pop();
        markers.set(innermost.at, innermost.remaining);
        markers.set(i + spent, innermost.remaining);
        spent += innermost.remaining;
      }
      if (spent === 0) {
        open.push({ at: i, remaining: length }); // closed nothing, so it all opens
      }
      // A closer's surplus is text: left out of the map, and left out of the
      // repair below, because this run has already had its say.
      i += length;
      continue;
    }
    i += 1;
  }

  repairEmphasis(open, markers);
  return markers;
}

/**
 * Pair up what the exact pass could not, taking as many asterisks as the shorter
 * side has. Runs arrive outermost-first, which is the order they were written in,
 * and whatever is still unspent at the end is simply text.
 */
function repairEmphasis(
  leftover: readonly OpenEmphasis[],
  markers: Map<number, number>,
): void {
  const open: OpenEmphasis[] = [];
  for (const run of leftover) {
    let spent = 0;
    while (spent < run.remaining && open.length > 0) {
      const innermost = open[open.length - 1];
      const use = Math.min(innermost.remaining, run.remaining - spent);
      // The opener gives up its rightmost asterisks and the closer its leftmost,
      // so the pair closes in around the words and the surplus stays outside.
      innermost.remaining -= use;
      markers.set(innermost.at + innermost.remaining, use);
      markers.set(run.at + spent, use);
      if (innermost.remaining === 0) {
        open.pop();
      }
      spent += use;
    }
    if (spent < run.remaining) {
      open.push({ at: run.at + spent, remaining: run.remaining - spent });
    }
  }
}

/** One matched pair of emphasis marker groups, and the text between them. */
export interface EmphasisSpan {
  /** Index of the first `*` of the OPENING group. */
  start: number;
  /** Index of the first `*` of the CLOSING group. */
  end: number;
  /** Asterisks in each group — 1 italic, 2 bold, 3 both. */
  length: number;
}

/**
 * A line's matched emphasis spans, **innermost first** — the pairs behind the
 * marker map, which records only where each group is and how long it is.
 *
 * **Emphasis is a span, not a wrapper around a word.** Pressing Bold on
 * `**Karneval karneval**` means "this is bold, stop that", so the toolbar has to
 * be able to name the thing the markers made. Reading only the asterisks
 * *adjacent* to whatever the button was about to wrap cannot do that: the run is
 * invisible unless the range happens to sit against both groups, so the button
 * wrapped a second pair around it and left the first one standing.
 *
 * A group closes the open one it matches in length, which is how
 * {@link emphasisMarkers} paired them in the first place; a group that matches
 * nothing simply never becomes a span, and the caller is left where it started.
 * Closing order is innermost-first, so the first span containing a point is the
 * tightest one around it — `*b*` in `**a *b* c**`, not the bold outside it.
 *
 * One recogniser: the spans the toolbar rewrites are the spans Phase 2 renders
 * and the highlighter colours. `from` skips a label marker, exactly as it does
 * for the markers themselves.
 */
export function emphasisSpans(s: string, from = 0): EmphasisSpan[] {
  const markers = emphasisMarkers(s, from);
  /** Groups still looking for the one that closes them, innermost last. */
  const open: OpenEmphasis[] = [];
  const spans: EmphasisSpan[] = [];

  // An opener is recorded only once its closer is found, so the map is not in
  // reading order — and reading order is the whole algorithm.
  for (const at of [...markers.keys()].sort((a, b) => a - b)) {
    const length = markers.get(at) as number;
    const innermost = open[open.length - 1];
    if (innermost === undefined || innermost.remaining !== length) {
      open.push({ at, remaining: length });
      continue;
    }
    open.pop();
    spans.push({ start: innermost.at, end: at, length });
  }
  return spans;
}

/**
 * Split a bracket's inner content into chord tokens on spaces/commas. Multiple
 * tokens = multiple anchors at the same index (PARSER-GRAMMAR §Line model).
 */
export function splitChordTokens(inner: string): string[] {
  return inner.split(/[\s,]+/).filter((token) => token.length > 0);
}

/**
 * Consume escape backslashes, turning `\X` into a literal `X` for every escapable
 * `X`. A lone `\` before a non-escapable char is kept.
 *
 * Applies **inside brackets too**, not only in lyric text. A repeat sign written
 * as `[||\: … :||]` has to escape the colon — an unescaped `[||:` reads as a
 * label (a colon-run followed by a space, PARSER-GRAMMAR §Labelled content), so
 * the whole `[||` becomes a label and the chords its content. The escape is
 * therefore load-bearing, and its backslash must not survive into the rendered
 * annotation. Resolving it here is what removes the stray `\`.
 */
export function unescape(token: string): string {
  let out = '';
  let i = 0;
  while (i < token.length) {
    if (
      token[i] === '\\' &&
      i + 1 < token.length &&
      ESCAPABLE.has(token[i + 1])
    ) {
      out += token[i + 1];
      i += 2;
    } else {
      out += token[i];
      i += 1;
    }
  }
  return out;
}

/**
 * Index of a line's **label delimiter** — the last colon of the first unescaped
 * colon-run that is followed by a space or end-of-line — or -1 for an ordinary
 * lyric (PARSER-GRAMMAR §Labelled content).
 *
 * Empty label text is not a label (`: foo` is a lyric), and `\:` never counts.
 * A colon not followed by space-or-EOL is not a delimiter, which is why
 * `http://x` and `12:30` need no escaping.
 *
 * One recogniser, like `findClosingBracket`: Phase 1 slices a label out of it and
 * the editor's highlighter colours one with it. Two implementations of "is this a
 * label" would drift, and the drift would show up as text that highlights as a
 * label and parses as a lyric.
 */
export function findLabelDelimiter(line: string): number {
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') {
      i += 2; // escape-aware: `\:` can never be a delimiter
      continue;
    }
    if (c === ':') {
      let j = i;
      while (j < line.length && line[j] === ':') {
        j++;
      }
      const after = j < line.length ? line[j] : undefined;
      if (after === undefined || after === ' ') {
        // The run's LAST colon delimits; earlier ones are literal label text.
        return i === 0 ? -1 : j - 1; // empty label text is meaningless → lyric
      }
      i = j; // colon-run not a delimiter; keep scanning past it
      continue;
    }
    i++;
  }
  return -1;
}
