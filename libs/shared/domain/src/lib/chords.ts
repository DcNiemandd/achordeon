// Shared chord sub-grammar helpers — Epic 2
// Spec: docs/PARSER-GRAMMAR.md §Phase 2, §Escapes, §No nesting. One bracket
// recogniser feeds both the Phase-2 inline scan and `transposeContent`.

/** Chars a backslash makes literal (PARSER-GRAMMAR §Escapes). `\\` → one `\`. */
export const ESCAPABLE = new Set([':', '*', '[', '\\']);

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
