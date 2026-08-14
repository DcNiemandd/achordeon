// The songbook title page, as content — Epic 7 ▸ subtask 6
// Spec: PRD-INFRASTRUCTURE.md §8 (the songbook PDF's title page),
// CONTEXT.md §Songbook (title / subtitle / author are AUTHORED via GUI)
//
// A title page is **a page of the songbook**, so it is drawn by the renderer
// like every other page rather than by a second layout engine that would have to
// be kept in step with the first. Which means it needs its content in a shape
// the renderer takes, and this is it: the book's three authored fields, plus the
// two facts a variant may print about the book itself.
//
// One definition, two callers: the PDF draws it, and `/songbooks` pane B
// previews it. Before this, the preview was a stack of styled `<p>`s that looked
// nothing like the page it was previewing.
//
// This used to be a `SongAst`, and the change is the point: a title page is not
// a song. Handing it to the song renderer meant every variant had to be
// expressible as "a title block above some lines", which is why only one of the
// four ever landed. `layoutTitlePage` (shared/render-core) takes this instead
// and places each field on the page itself.

import type { Songbook } from './entities';

/**
 * What a title page has to print — the book, reduced to the facts a variant can
 * put on the paper.
 *
 * Every field but `title` is optional, and each variant decides what it uses: a
 * `minimal` page prints the title and nothing else even when a book has an
 * author, and that is the variant working rather than a field being lost.
 */
export interface TitlePageContent {
  /** Never empty — see {@link titlePageContent}. */
  readonly title: string;
  readonly subtitle?: string;
  readonly author?: string;
  /**
   * How many songs the book binds, **already worded and translated** by the
   * caller ("12 songs").
   *
   * A string rather than a number because the renderer draws text and does not
   * speak any language: it is geometry, it has no locale, and a plural rule is
   * not something the pure layout half should be carrying. `ticket` is the one
   * variant that prints it; the rest ignore it.
   */
  readonly countLabel?: string;
}

/**
 * The title page of `book`.
 *
 * `title` falls back to the **library name**: a book you have not given a title
 * to still has to print something, and its name is what you call it everywhere
 * else in the app. Blank fields are dropped rather than passed as empty strings,
 * so a variant asking "is there an author" gets an answer instead of drawing an
 * empty line that still takes up its own height.
 */
export function titlePageContent(
  book: Songbook,
  countLabel?: string,
): TitlePageContent {
  return {
    title: book.title.trim() || book.name,
    ...(book.subtitle?.trim() ? { subtitle: book.subtitle } : {}),
    ...(book.author?.trim() ? { author: book.author } : {}),
    ...(countLabel ? { countLabel } : {}),
  };
}
