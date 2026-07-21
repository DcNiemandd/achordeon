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

/** Everything the songbook PDF dialog decides. */
export interface SongbookPdfChoice {
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
