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
export const SNIPPETS = {
  /** `[]` around the selection, caret between the brackets. */
  chord: { before: '[', after: ']', caretOffset: 0 } satisfies InsertRequest,

  /** Line-scoped: the marker only counts at column 0. */
  title: { before: '* ', atLineStart: true } satisfies InsertRequest,
  subtitle: { before: '** ', atLineStart: true } satisfies InsertRequest,

  /**
   * Inline, unlike title/subtitle: a label is `text: content`, so the delimiter
   * goes *after* the words you already typed. Type "Chorus", click, get
   * "Chorus: " — which is the order the thought arrives in.
   */
  label: { before: ': ' } satisfies InsertRequest,

  /** A blank line — the block boundary (PARSER-GRAMMAR §Block boundaries). */
  block: { before: '\n\n' } satisfies InsertRequest,
};
