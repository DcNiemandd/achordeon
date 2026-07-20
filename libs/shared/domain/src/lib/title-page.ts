// The songbook title page, as content — Epic 7 ▸ subtask 6
// Spec: PRD-INFRASTRUCTURE.md §8 (the songbook PDF's title page),
// CONTEXT.md §Songbook (title / subtitle / author are AUTHORED via GUI)
//
// A title page is **a page of the songbook**, so it is drawn by the renderer
// like every other page rather than by a second layout engine that would have to
// be kept in step with the first. Which means it needs an AST, and this is it:
// the book's three authored fields, in the shapes the renderer already knows —
// title, subtitle, and the author as the one line of content.
//
// One definition, two callers: the PDF draws it, and `/songbooks` pane B
// previews it. Before this, the preview was a stack of styled `<p>`s that looked
// nothing like the page it was previewing.

import type { SongAst } from './ast';
import type { Songbook } from './entities';

/**
 * The title page of `book`, as a `SongAst`.
 *
 * `title` falls back to the **library name**: a book you have not given a title
 * to still has to print something, and its name is what you call it everywhere
 * else in the app. A book with no author has no content line at all rather than
 * an empty one — an empty block would still take vertical space and shift the
 * title off the centre it was placed at.
 */
export function titlePageAst(book: Songbook): SongAst {
  return {
    title: book.title || book.name,
    subtitle: book.subtitle,
    blocks: book.author ? [{ lines: [{ text: book.author, chords: [] }] }] : [],
    warnings: [],
  };
}
