// Songbook page plan — the sequence both sinks obey
// Spec: PRD-INFRASTRUCTURE.md §8 (title page, then summary, then the songs)
//
// The one definition of what pages a songbook has and in what order: front matter
// first — the title page, then the contents — then the songs, each on one sheet.
// Pure arithmetic, the sibling of `page-geometry` and `summary-layout`: no jsPDF,
// no DOM, no render.
//
// It exists because a songbook now has TWO sinks — the PDF the download writes and
// the on-screen print preview — and the one thing they must never disagree on is
// which sheet is page 7. Numbering that lives only inside the PDF draw loop cannot
// be shared, so it drifts by construction the day a second reader appears. Lifted
// here it is one tested answer both consume, and the preview is WYSIWYG of the file
// rather than a second guess at it.

export type SongbookPageKind = 'title' | 'summary' | 'song';

/** One sheet of the book, in reading order. */
export interface SongbookPage {
  readonly kind: SongbookPageKind;
  /**
   * Which source of its kind this sheet draws: the 0-based summary sheet, or the
   * 0-based song. `undefined` for the lone title page — there is only ever one.
   */
  readonly sourceIndex?: number;
  /**
   * The number printed on the sheet, or `null` for front matter.
   *
   * A title page and a contents page carry none: numbering them would send the
   * summary to "page 3" for the first song, a number the reader can only use by
   * counting past two sheets that also claim numbers.
   */
  readonly number: number | null;
}

export interface SongbookPlanInput {
  readonly hasTitlePage: boolean;
  /**
   * Sheets the contents list occupies — `layoutSummary(...).pages`. 0 when there
   * is no summary, and 0 for an empty book: a contents page listing nothing is a
   * blank sheet, not front matter.
   */
  readonly summaryPages: number;
  /** Songs that will print, each on exactly one sheet (§8). */
  readonly songCount: number;
}

export interface SongbookPlan {
  readonly pages: readonly SongbookPage[];
  /**
   * Sheets before page 1. The physical sheet index and the printed number differ
   * by exactly this, and it is what every page number and every summary link
   * converts through.
   */
  readonly frontMatter: number;
}

/**
 * The ordered pages of a songbook: front matter (the title page, then the
 * summary), then one numbered sheet per song.
 *
 * **The first song is page 1.** Front matter carries no number, so a song's
 * printed number is its place in the book, not its physical sheet index — the two
 * differ by `frontMatter`.
 */
export function planSongbook(input: SongbookPlanInput): SongbookPlan {
  const pages: SongbookPage[] = [];

  if (input.hasTitlePage) {
    pages.push({ kind: 'title', number: null });
  }
  for (let sheet = 0; sheet < input.summaryPages; sheet++) {
    pages.push({ kind: 'summary', sourceIndex: sheet, number: null });
  }

  // Everything pushed so far is front matter; the songs number from here.
  const frontMatter = pages.length;

  for (let i = 0; i < input.songCount; i++) {
    pages.push({ kind: 'song', sourceIndex: i, number: i + 1 });
  }

  return { pages, frontMatter };
}
