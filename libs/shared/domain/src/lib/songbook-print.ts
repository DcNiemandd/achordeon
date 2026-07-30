// Book-bound print settings — Epic (songbook preview)
// Spec: PRD-INFRASTRUCTURE.md §8 (the songbook PDF), CONTEXT.md §Songbook
//
// A songbook's print STRUCTURE — whether it has a title page, a contents page,
// page numbers, and where those numbers go — is a property of the BOOK, not of
// the machine it is printed from. "This hymnal has a contents page" is a fact
// about the hymnal, and it should travel with the hymnal to every device and sit
// pre-filled in its download dialog.
//
// So these fields live on the `Songbook` record and sync. The OTHER half of the
// print dialog — format, page size, orientation, margin — is about the paper in
// *this* printer and stays device-local (the app's `PrintOptionsStore`); it never
// reaches here.

/** A title-page layout. Only `classic` renders today; the rest are declared so
 * the dialog can offer them and land later (Epic 7 follow-up stub). */
export type TitlePageVariant = 'classic' | 'centered' | 'banner' | 'minimal';

/**
 * Where a song's page number goes. Six spots on the paper — and `before-title`,
 * which is not a spot at all: it puts the number into the song's heading
 * ("7. Wonderwall"), which is how a book is used out loud and what survives a page
 * being photocopied or re-bound.
 */
export type PageNumberPlace =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left'
  | 'before-title';

/**
 * Which side of the title the **summary's** page number sits on: `after` is the
 * reference table (`title · · · 7`), `before` is the hymnal (`7.  title`). One or
 * the other, never both — a songbook numbers each song by its page, so a contents
 * line carrying the number at each end says it twice.
 */
export type SummaryNumberPlace = 'before' | 'after';

/**
 * The book-bound half of a songbook's print settings — its structure, which
 * travels with the book. Stored complete when present; see {@link resolveSongbookPrint}
 * for how an absent field (an older row, or the virtual All songs) resolves.
 */
export interface SongbookPrint {
  readonly hasTitlePage: boolean;
  readonly titlePageVariant: TitlePageVariant;
  readonly hasSummary: boolean;
  readonly summaryNumberPlace: SummaryNumberPlace;
  readonly hasPageNumbers: boolean;
  readonly pageNumberPosition: PageNumberPlace;
}

/** How a book prints when it has said nothing: a title page and bottom-centred
 * page numbers, no contents page. */
export const DEFAULT_SONGBOOK_PRINT: SongbookPrint = {
  hasTitlePage: true,
  titlePageVariant: 'classic',
  hasSummary: false,
  summaryNumberPlace: 'after',
  hasPageNumbers: true,
  pageNumberPosition: 'bottom-center',
};

/**
 * A book's print settings with every default filled in.
 *
 * The record's `print` is optional (ADR-0007 additive) and the virtual All songs
 * has no record at all, so an absent value — or a value written before a field
 * existed — must resolve to the standard book rather than reaching the renderer
 * with holes. Per-field merge over the defaults, so a later-added field is safe on
 * an older row.
 */
export function resolveSongbookPrint(
  print?: Partial<SongbookPrint>,
): SongbookPrint {
  return { ...DEFAULT_SONGBOOK_PRINT, ...print };
}
