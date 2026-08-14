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
  /**
   * How loud the underline is. Defaults to `warning` — something the grammar
   * will not do what you meant with.
   *
   * `info` is the quieter kind: **an explanation, not a complaint**. A bracket
   * with no chord in it (`[Solo]`, or a mistyped `[Amm]`) is legal and prints
   * exactly as written, so calling it a warning would be crying wolf at half the
   * annotations in a real song — but it is also the only place a typo in a chord
   * name can hide, so saying nothing is how `[Amm]` reaches the printed page.
   * Marked, hoverable, and deliberately not alarming.
   */
  readonly severity?: 'info' | 'warning';
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
   * A line marker this insert REPLACES rather than stacks on — and TOGGLES when
   * the marker it finds is the one it writes.
   *
   * Clicking Title on a subtitle converts it instead of producing `* ** `, and
   * clicking Title on a title takes the marker off again rather than writing
   * `* * `. Without it the buttons only worked on a line that had no marker yet —
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
  /**
   * With nothing selected, wrap the WORD the caret is inside rather than opening
   * an empty pair.
   *
   * Bold and Italic want this: pressing Bold with the caret in the middle of a
   * word means "make this word bold", not "type `**` here and start over". Only
   * bites for a wrapping insert (`after` set) with no selection and a word under
   * the caret; on whitespace it falls back to the empty pair.
   *
   * A word is only the guess made where there is no markup yet. With
   * `togglesEmphasis`, an emphasis span the caret is already inside is the better
   * answer and takes precedence — see there.
   */
  readonly wrapsWord?: boolean;
  /**
   * This insert TOGGLES one emphasis bit instead of wrapping blindly.
   *
   * Emphasis is not a pair of markers you add, it is a **run** of asterisks whose
   * length says which bits are on — one is italic, two is bold, three is both
   * (PARSER-GRAMMAR §Phase 2). So Bold on `*x*` has to write `***x***`, and Italic
   * on `***x***` has to write `**x**`: the button flips its own bit and leaves the
   * other one exactly as it was. Wrapping instead of flipping is how a second press
   * used to pile up a fourth asterisk (which the grammar reads as no emphasis),
   * and how Italic inside a bold run used to quietly un-bold it — the two markers
   * are the same character, so "is it already wrapped in `*`" cannot tell them
   * apart. Only the run length can.
   *
   * The run it flips is the one around the **span** the range is about — the
   * caret's enclosing span, or the span a selection was drawn around with its
   * markers included. Reading only the asterisks touching the range missed both,
   * and wrapped a second pair around a span that was already there.
   */
  readonly togglesEmphasis?: 'italic' | 'bold';
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
  /**
   * The caret sits inside a chord bracket — past the `[` and no further than the
   * `]` that closes it. An unterminated `[` is literal text, not a bracket
   * (PARSER-GRAMMAR §Phase 2), so this is false on the rest of such a line.
   */
  readonly isInsideChord: boolean;
}
