// Editor seam types — Epic 5 ▸ subtask 4
// Spec: ADR-0010 (no CodeMirror type crosses this boundary)

/**
 * A problem to underline, in the editor's own vocabulary.
 *
 * Deliberately **not** the domain's `Warning`, and deliberately not CodeMirror's
 * `Diagnostic`: the first carries a `code` that only the UI knows how to say out
 * loud, and the second is the thing ADR-0010 forbids from escaping the adapter.
 * This is the narrow shape both sides can agree on — a place and a sentence.
 */
export interface EditorMarker {
  /** 0-based source line. */
  readonly line: number;
  /** `[start, end)` within the line. Omitted = the whole line. */
  readonly range?: readonly [number, number];
  readonly message: string;
}

/**
 * What an insert-syntax button asks for (subtask 5).
 *
 * `before`/`after` wrap the selection — insert a chord over selected text and the
 * text survives, bracketed. `caretOffset` counts from the end of `before`, so an
 * empty `[]` can leave the caret between the brackets rather than after them,
 * which is where you are about to type.
 */
export interface InsertRequest {
  readonly before: string;
  readonly after?: string;
  /**
   * Where the caret lands when nothing was selected, counted from the start of
   * `before`. With `atLineStart` it counts from the start of the LINE instead —
   * which is how Label puts the caret before the colon it just wrote.
   */
  readonly caretOffset?: number;
  /**
   * Put `before` at the start of the current line instead of at the cursor.
   *
   * Title and Subtitle are line-scoped in the grammar — the marker only counts at
   * column 0 (PARSER-GRAMMAR §asterisk rule) — so "make this a title" is an
   * operation on the line, not on the cursor. Inserting `* ` where the caret
   * happens to sit would produce a lyric with a literal asterisk in it.
   */
  readonly atLineStart?: boolean;
  /**
   * A line marker this insert REPLACES rather than stacks on.
   *
   * Makes a line-scoped button idempotent: clicking Title twice leaves a title,
   * not `* * `, and clicking Title on a subtitle converts it instead of producing
   * `* ** `. Without it the buttons only worked on a line that had no marker yet —
   * which is not how anyone uses them.
   */
  readonly replacesLineStart?: RegExp;
  /**
   * Skip the insert when the caret already sits in an empty block.
   *
   * The block button writes a blank line, and a blank line between two blank
   * lines is not a second boundary — it is just a bigger gap that the parser
   * ignores. Pressing it repeatedly should stop mattering after the first press.
   */
  readonly hasBlankBlockGuard?: boolean;
}
