// Transfer UI contract — Epic 7
// Spec: PRD-INFRASTRUCTURE.md §8; PRD-UI-SHELL.md §3 (the presenter seam)
//
// The vocabulary the download/import dialogs speak. Declared here rather than
// imported from `shared/data-access`, which the import ladder forbids this
// folder from touching: these are structurally the service's own types, so a
// drift between the two breaks the *presenter's* build — which is where a
// mismatch should surface, since the presenter is the only thing spanning both.
// The same trick `ExplorerSort` plays with the store's `SortKey`.

/** One song, as a file. */
export type SongDownloadFormat = 'png' | 'pdf';

/** Several songs, as a file (§8). */
export type MultiDownloadFormat = 'zip-png' | 'zip-pdf' | 'pdf';

export type DownloadFormat = SongDownloadFormat | MultiDownloadFormat;

export type PageSizeChoice = 'A4' | 'Letter' | 'A5';

export type PageNumberPlace =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

/** A title-page layout. Only `classic` renders today; the rest are declared so
 * the dialog can offer them, and land later (Epic 7 follow-up stub). */
export type TitlePageVariant = 'classic' | 'centered' | 'banner' | 'minimal';

/**
 * What shape a songbook comes out as: one printable `pdf`, or a `zip-png` — a
 * folder of one PNG per song, named in book order (`01-…`, `02-…`) after a
 * `00-summary.png` contents page. The paper options (size, margins, page
 * numbers) belong only to the PDF; the summary and, for All songs, the order
 * apply to both.
 */
export type SongbookFormat = 'pdf' | 'zip-png';

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

/** Everything the songbook download dialog decides. */
export interface SongbookPdfChoice {
  /** Printable PDF, or a ZIP of per-song images. Chooses which of the fields
   * below matter — the paper options are the PDF's alone. */
  readonly format: SongbookFormat;
  readonly pageSize: PageSizeChoice;
  readonly isLandscape: boolean;
  readonly marginMm: number;
  readonly hasTitlePage: boolean;
  /** Which title-page layout. A stub beyond `classic` for now. */
  readonly titlePageVariant: TitlePageVariant;
  readonly hasSummary: boolean;
  readonly hasPageNumbers: boolean;
  readonly pageNumberPosition: PageNumberPlace;
  /** The order All songs prints in. Ignored for a real songbook, whose order is
   * its content — the dialog only shows this control for All songs. */
  readonly songOrder: SongOrder;
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
}

export interface ImportChoice {
  readonly resolution: ImportResolutionChoice;
  readonly isAllNew: boolean;
}
