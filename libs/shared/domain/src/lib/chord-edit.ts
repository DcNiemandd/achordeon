// Chord editing — pure source rewrites the Chord button drives
// Spec: docs/PARSER-GRAMMAR.md §Authoring notes. A destructive SOURCE rewrite,
// like transpose (transpose.ts) and for the same reason: the text is the truth, so
// an editing action edits the text and the AST follows on the next reparse.

import { bracketAt } from './chords';

/**
 * Cycle the chord bracket the caret sits in: `[C]` → `[[C]]` → `C`.
 *
 * The second and third states of the Chord button. The first — wrapping the
 * selection or the word at the caret in a fresh `[…]` — belongs to the editor,
 * which is the only thing that knows what "the word at the caret" is; this handles
 * the two the source text can answer on its own. Returns null when the caret is in
 * no bracket, which is the editor's cue to do the wrapping instead.
 *
 * So the button has one meaning that reads round: bracket the word, make it
 * inline, take the brackets away. Nothing is disabled and nothing is unreachable
 * — which is why the Chord button no longer greys out inside a bracket the way
 * §No nesting once required it to.
 *
 * `caret` is where the caret should land: the same character it was on, shifted by
 * whatever the rewrite put in front of it.
 */
export function cycleChordAt(
  content: string,
  index: number,
): { content: string; caret: number } | null {
  const span = bracketAt(content, index);
  if (!span) {
    return null;
  }
  const inner = content.slice(span.start + (span.inline ? 2 : 1), span.end);
  if (span.inline) {
    // Take both brackets off, leaving the chord as plain text.
    return {
      content:
        content.slice(0, span.start) + inner + content.slice(span.end + 2),
      caret: Math.max(span.start, index - 2),
    };
  }
  // Double the brackets, which is what makes the chord inline.
  return {
    content:
      content.slice(0, span.start) +
      '[[' +
      inner +
      ']]' +
      content.slice(span.end + 1),
    caret: index + 1,
  };
}
