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
   * The line may already carry this construct — go to it instead of writing a
   * second one.
   *
   * `label` is the case: a line reads `Chorus: sing`, and pressing Label again
   * used to prepend another delimiter (`: Chorus: sing`), inventing an empty
   * label in front of the real one. There can only be one label per line, so the
   * button's job on a labelled line is to put the caret in the label that is
   * already there.
   */
  readonly movesToExistingLabel?: boolean;
  /**
   * Skip the insert when the caret already sits in an empty block.
   *
   * The block button writes a blank line, and a blank line between two blank
   * lines is not a second boundary — it is just a bigger gap that the parser
   * ignores. Pressing it repeatedly should stop mattering after the first press.
   */
  readonly hasBlankBlockGuard?: boolean;
  /**
   * Put `before` at the END of the current line rather than at the cursor.
   *
   * For inserts that act on the line as a unit from below, the way `atLineStart`
   * does from above. A block boundary is the case: it separates this line from
   * the next, so it belongs after the line — inserting it at the cursor split
   * whatever word the caret happened to be sitting in.
   */
  readonly atLineEnd?: boolean;
}

/**
 * What kind of line the caret is on, in the editor's own vocabulary.
 *
 * Enough for a toolbar to grey out an action that would write markup the grammar
 * ignores here — a chord in a title is literal text, not a chord (PARSER-GRAMMAR
 * §Phase 1: `*` lines never reach the inline scan). Deliberately coarse: this is
 * a hint for enabling buttons, not a second parser.
 */
export type CaretLineKind = 'title' | 'subtitle' | 'content';

/**
 * Where the caret is, in the terms a toolbar needs to decide what it may write.
 *
 * Deliberately coarse and deliberately *not* an AST: it answers "would this
 * insert produce something the grammar honours here", nothing more (ADR-0010 —
 * the editor never parses).
 */
export interface CaretContext {
  readonly lineKind: CaretLineKind;
  /** The caret sits between an unclosed `[` and its `]` — brackets do not nest. */
  readonly isInsideChord: boolean;
}
