// Transfer UI contract — Epic 7
// Spec: PRD-INFRASTRUCTURE.md §8; PRD-UI-SHELL.md §3 (the presenter seam)
//
// The vocabulary the download/import dialogs speak. Declared here rather than
// imported from `shared/data-access`, which the import ladder forbids this
// folder from touching: these are structurally the service's own types, so a
// drift between the two breaks the *presenter's* build — which is where a
// mismatch should surface, since the presenter is the only thing spanning both.
// The same trick `ExplorerSort` plays with the store's `SortKey`.

import {
  DEFAULT_SONGBOOK_PRINT,
  resolveSongbookPrint,
  type SongbookPrint,
} from '@achordeon/shared/domain';

// The book-bound print enums are the record's own vocabulary now — re-exported so
// this folder's consumers still find them here, but authored once, in the domain.
export type {
  PageNumberPlace,
  SongbookPrint,
  SummaryNumberPlace,
  TitlePageVariant,
} from '@achordeon/shared/domain';

/** One song, as a file. */
export type SongDownloadFormat = 'png' | 'pdf';

/** Several songs, as a file (§8). */
export type MultiDownloadFormat = 'zip-png' | 'zip-pdf' | 'pdf';

export type DownloadFormat = SongDownloadFormat | MultiDownloadFormat;

/**
 * The Achordeon file — the library's own JSON, which is what **Export** means
 * (CONTEXT.md §Export).
 *
 * Deliberately NOT a member of `DownloadFormat`. Download and Export are one
 * button and one dialog now, because a person choosing what to take away should
 * not have to know which word we use for which file — but they remain two acts
 * on two services (`DownloadService` renders, `ExportService` serialises), and a
 * type that let `'json'` reach `downloadSong` would be lying about that. The
 * union below is the *dialog's* vocabulary; the presenter splits it back in two.
 */
export const DATA_FORMAT = 'json';
export type DataFormat = typeof DATA_FORMAT;

/**
 * The same songs as a **link**, copied to the clipboard rather than written to
 * disk (CONTEXT.md §Share).
 *
 * A third choice in the same dialog for the same reason the Achordeon file is the
 * second: a person deciding what to take away should not have to know which of
 * our words applies to which file. It is not an export — nothing lands on disk —
 * but it answers the same question, so it is asked in the same place, and the
 * presenter fans it out to its own service exactly as it already splits
 * `DownloadService` from `ExportService`.
 */
export const SHARE_LINK_FORMAT = 'share-link';
export type ShareLinkFormat = typeof SHARE_LINK_FORMAT;

/** What the download dialog can hand back: a render, the data file, or a link. */
export type DownloadChoice = DownloadFormat | DataFormat | ShareLinkFormat;

export type PageSizeChoice = 'A4' | 'Letter' | 'A5';

/**
 * What shape a songbook comes out as: one printable `pdf`, or a `zip-png` — a
 * folder of one PNG per song, named in book order (`01-…`, `02-…`) after a
 * `00-summary.png` contents page. The paper options (size, margins, page
 * numbers) belong only to the PDF; the summary and, for All songs, the order
 * apply to both.
 */
export type SongbookFormat = 'pdf' | 'zip-png';

/** The songbook dialog's own vocabulary: the two renders, **plus the Achordeon
 * file** — the same merge the song dialog makes, expressed through the format
 * control the dialog already had. Picking `json` retires every paper question
 * below it, because none of them is about a database. */
export type SongbookChoiceFormat =
  | SongbookFormat
  | DataFormat
  | ShareLinkFormat;

/**
 * The axis the **All songs** book is ordered by when it prints.
 *
 * Only All songs uses it — a real songbook's order *is* its content, so it is
 * printed as arranged and this is ignored. `title` is the printed heading a
 * reader flips to find; the rest mirror the library's own sort axes.
 */
export type SongOrderAxis = 'title' | 'name' | 'created' | 'changed';
export type SongOrderDir = 'asc' | 'desc';

/** How All songs is ordered for print: axis, direction, and starred-first. */
export interface SongOrder {
  readonly axis: SongOrderAxis;
  readonly dir: SongOrderDir;
  readonly favoritesFirst: boolean;
}

/**
 * The **device-bound** half of the dialog's answer: the paper in *this* printer.
 *
 * These are about the machine, not the book — "A4 at home, Letter at the office"
 * — so they are remembered device-local (`PrintOptionsStore`) and shared across
 * every book, never synced. The book-bound half is {@link SongbookPrint}, which
 * lives on the record.
 *
 * `songOrder` rides here too: it is asked only for the virtual All songs (a real
 * book's order is its content) and has no record to live on, so it stays a
 * device-remembered dialog answer.
 */
export interface DevicePrintOptions {
  /** Printable PDF, a ZIP of per-song images, or the Achordeon file. Chooses
   * which of the fields below matter — the paper options are the PDF's alone,
   * and the data file wants none of them. */
  readonly format: SongbookChoiceFormat;
  readonly pageSize: PageSizeChoice;
  readonly isLandscape: boolean;
  readonly marginMm: number;
  /** The order All songs prints in. Ignored for a real songbook, whose order is
   * its content — the dialog only shows this control for All songs. */
  readonly songOrder: SongOrder;
}

/**
 * Everything the songbook download dialog decides — the device-bound paper and
 * the book-bound structure, as one flat shape the controlled dialog reads and
 * writes. The presenter composes it from the two homes and splits it back on
 * confirm (see {@link composeSongbookChoice}, {@link toDevicePrintOptions},
 * {@link toSongbookPrint}).
 */
export interface SongbookPdfChoice extends DevicePrintOptions, SongbookPrint {}

/** The paper a device opens the dialog on until it is told otherwise. */
export const DEFAULT_DEVICE_PRINT_OPTIONS: DevicePrintOptions = {
  format: 'pdf',
  pageSize: 'A4',
  isLandscape: false,
  marginMm: 10,
  // All songs prints by title (the heading a reader flips to find) by default.
  songOrder: { axis: 'title', dir: 'asc', favoritesFirst: false },
};

/** The whole dialog's fallback: device paper + the standard book structure. Used
 * as the controlled dialog's input default and for the margin clamp. */
export const DEFAULT_SONGBOOK_CHOICE: SongbookPdfChoice = {
  ...DEFAULT_DEVICE_PRINT_OPTIONS,
  ...DEFAULT_SONGBOOK_PRINT,
};

/** Compose the dialog's opening value: the device's paper, and the book's own
 * print structure (or the defaults for a book that has said nothing, and for the
 * record-less All songs). */
export function composeSongbookChoice(
  device: DevicePrintOptions,
  print?: Partial<SongbookPrint>,
): SongbookPdfChoice {
  return { ...device, ...resolveSongbookPrint(print) };
}

/** The device-bound half of a confirmed choice, to remember device-local. */
export function toDevicePrintOptions(
  choice: SongbookPdfChoice,
): DevicePrintOptions {
  return {
    format: choice.format,
    pageSize: choice.pageSize,
    isLandscape: choice.isLandscape,
    marginMm: choice.marginMm,
    songOrder: choice.songOrder,
  };
}

/** The book-bound half of a confirmed choice, to write onto the record. */
export function toSongbookPrint(choice: SongbookPdfChoice): SongbookPrint {
  return {
    hasTitlePage: choice.hasTitlePage,
    titlePageVariant: choice.titlePageVariant,
    hasSummary: choice.hasSummary,
    summaryNumberPlace: choice.summaryNumberPlace,
    hasPageNumbers: choice.hasPageNumbers,
    pageNumberPosition: choice.pageNumberPosition,
  };
}

/** How far a download's generation has got, for the dialog to show as a spinner
 * and an "n of N" count. Mirrors the service's `DownloadProgress` callback. */
export interface DownloadProgress {
  readonly done: number;
  readonly total: number;
}

/** Why a picked file could not be imported — the two the user can act on: it is
 * not one of ours, or it is from a build this one cannot read. */
export type ImportFailure = 'unreadable' | 'refused';

/** What to do about the songs a file brings that the library already has. */
export type ImportResolutionChoice = 'replace' | 'ignore' | 'new';

/** One collision, as the dialog lists it. */
export interface ImportConflictRow {
  readonly id: string;
  readonly incomingName: string;
  readonly existingName: string;
}

/** What an import is about to do, for the dialog to describe before it does it. */
export interface ImportPreview {
  readonly songCount: number;
  readonly songbookCount: number;
  readonly conflicts: readonly ImportConflictRow[];
  /** The file carries settings this build does not know — additive, from a
   * newer app. Kept, not dropped; the user is told, not stopped. */
  readonly hasUnknownSettings: boolean;
  /**
   * Which incoming songs the parser has something to say about, by name.
   *
   * The same warning as {@link hasUnknownSettings} pointed the other way: that
   * one says "this file knows things this build does not", this one says "this
   * build cannot make sense of some of what this file says".
   *
   * **Named, not counted** — the same rule {@link conflicts} follows, because a
   * number tells the reader how bad it is and a name tells them where to look.
   * One entry per song however many warnings it carries.
   */
  readonly flaggedSongs: readonly string[];
}

export interface ImportChoice {
  readonly resolution: ImportResolutionChoice;
  readonly isAllNew: boolean;
}
