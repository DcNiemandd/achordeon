// Parser AST + warning model — Epic 2
// Spec: docs/PARSER-GRAMMAR.md (§AST shape, §Error / warning model), ADR-0005

/**
 * A chord floating above a line by character index (overlay-by-index, not
 * interleaved runs). The renderer turns `at` into a pixel x via
 * `measureText(text.slice(0, at))`.
 */
export interface ChordAnchor {
  raw: string; // one chord/annotation token as written; rendered verbatim
  at: number; // index into the line's `text`: the char this anchor sits above
  valid: boolean; // true = transposable chord; false = verbatim annotation ([Solo], [x2])
}

/**
 * An emphasis run over a line's `text`, `[start, end)` in character indices —
 * the Phase-2 markdown overlay (`*i*`, `**b**`, `***bi***`). Like chords, the
 * markers are consumed from `text`; a span only ever carries the flags that are
 * on, so a plain stretch of text has no span at all.
 */
export interface Span {
  start: number; // inclusive index into text
  end: number; // exclusive
  bold?: boolean;
  italic?: boolean;
}

/**
 * One rendered line: a clean `text` string with chords overlaid by index.
 * Brackets are removed and escapes resolved in `text`. `spans` overlay emphasis
 * by index the same way — absent when the line has none.
 */
export interface Line {
  text: string; // final rendered characters
  chords: ChordAnchor[]; // overlay by index; same-index groups allowed, kept in order
  spans?: Span[]; // emphasis overlay by index; absent when the line is plain
}

/**
 * A block (verse, chorus, bridge…). Opened by a blank line or a label.
 * `labelInline` is render-significant: true = the label shared its source line
 * with the first content line; false/absent = the body started on the next line.
 */
export interface Block {
  label?: string; // rendered label text (the delimiter colon consumed)
  labelInline?: boolean; // see above; meaningful only when `label` is set
  lines: Line[]; // may be empty for a label-only block
}

/** Open enum (ADR-0005): codes stay extensible; the UI localises them. */
export type WarningCode = 'SHADOWED_TITLE' | 'SHADOWED_SUBTITLE';

/**
 * A structured, localisable problem — never a baked string (PARSER-GRAMMAR
 * §Error/warning). `line` is a 0-based source line index; `range` is a
 * `[start, end)` char span within that line.
 */
export interface Warning {
  code: WarningCode;
  line: number;
  range?: [number, number];
  data?: Record<string, unknown>;
}

/**
 * The pure semantic AST the editor, renderer, search, and transpose all consume.
 * `title`/`subtitle` are the single effective values ("last wins"); the parser is
 * total (never throws) and reports problems in `warnings`.
 */
export interface SongAst {
  title?: string;
  subtitle?: string;
  blocks: Block[];
  warnings: Warning[];
}
