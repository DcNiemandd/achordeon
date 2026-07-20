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
  | 'top-center'
  | 'top-right';

/** Everything the songbook PDF dialog decides. */
export interface SongbookPdfChoice {
  readonly pageSize: PageSizeChoice;
  readonly isLandscape: boolean;
  readonly marginMm: number;
  readonly hasTitlePage: boolean;
  readonly hasSummary: boolean;
  readonly hasPageNumbers: boolean;
  readonly pageNumberPosition: PageNumberPlace;
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
