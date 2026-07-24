// Insert-syntax snippets — Epic 5 ▸ subtask 5
// Spec: CONTEXT.md §Content syntax; docs/PARSER-GRAMMAR.md

import type { InsertRequest } from './editor-model';

/**
 * What each insert-syntax button writes.
 *
 * The buttons are for people who do not want to memorise the markup, so each one
 * produces the *shape* and leaves the words to the user — `[]` with the caret
 * inside, never `[C]` with a chord they did not choose.
 *
 * **No bold/italic button.** PRD-UI-SHELL.md §4 sketches `[B][I]` in this bar,
 * and CONTEXT.md lists them under the insert buttons — but Phase 2 markdown is
 * not implemented (PRD-RENDERING §4.10 defers italic), so `*bold*` would render
 * as literal asterisks today. A button that writes syntax the renderer ignores
 * teaches the user a lie. They land with markdown.
 */
/**
 * Any title/subtitle marker already on the line.
 *
 * One expression for both, so Title and Subtitle replace each other rather than
 * stacking. `\*{1,2} ` and not `\*+ `: three asterisks are not a marker in the
 * grammar, so they are content and must survive.
 */
const TITLE_MARKER = /^\*{1,2} /;

export const SNIPPETS = {
  /** `[]` around the selection, caret between the brackets. */
  chord: { before: '[', after: ']', caretOffset: 0 } satisfies InsertRequest,

  /**
   * Line-scoped: the marker only counts at column 0, and it replaces whatever
   * marker the line already had — so the buttons are idempotent and interchange
   * rather than accumulating asterisks.
   */
  title: {
    before: '* ',
    atLineStart: true,
    replacesLineStart: TITLE_MARKER,
  } satisfies InsertRequest,
  subtitle: {
    before: '** ',
    atLineStart: true,
    replacesLineStart: TITLE_MARKER,
  } satisfies InsertRequest,

  /**
   * An EMPTY label, with the caret in front of it, ready for the name.
   *
   * It writes `: ` at the start of the line and puts the caret at column 0, so
   * you type the label into the space it just opened. It used to insert `: ` at
   * the cursor, which made everything already to the left of the cursor the
   * label — click it with the caret at the end of a finished lyric line and the
   * whole line became a label with nothing in it. The label is a short name in
   * front of content, so the button opens a place to put one.
   */
  label: {
    before: ': ',
    atLineStart: true,
    caretOffset: 0,
    movesToExistingLabel: true,
  } satisfies InsertRequest,

  /**
   * A blank line — the block boundary (PARSER-GRAMMAR §Block boundaries).
   *
   * Written at the END of the line, not at the cursor: a boundary separates this
   * line from the next, so putting it wherever the caret happened to be split the
   * word you were in the middle of.
   */
  block: {
    before: '\n\n',
    atLineEnd: true,
    hasBlankBlockGuard: true,
  } satisfies InsertRequest,

  /**
   * A backslash, to make the next character literal (PARSER-GRAMMAR §Escapes).
   *
   * The one piece of the syntax you reach for precisely when the editor has just
   * surprised you — a `Narrator:` that became a label, a `[` you meant to keep.
   * Escapable set: `: * [ ] \`.
   */
  escape: { before: '\\' } satisfies InsertRequest,

  /**
   * The accidentals, as their ASCII source — `#` for sharp, `b` for flat.
   *
   * Written verbatim because that is what the chord grammar reads: a chord is
   * `C#` / `Bb`, not the Unicode `♯`/`♭` (`theory.parseChord` never sees those).
   * The buttons show `♯`/`♭` so a musician recognises them at a glance; the
   * character they insert is the one that makes `[C#]` a real chord. Reached for
   * inside a bracket while spelling a chord, so — unlike the `[`-chord button —
   * they are NOT blocked inside one.
   */
  sharp: { before: '#' } satisfies InsertRequest,
  flat: { before: 'b' } satisfies InsertRequest,
};
