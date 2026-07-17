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
 */
export const ESCAPABLE = new Set([':', '*', '[', ']', '\\']);

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
