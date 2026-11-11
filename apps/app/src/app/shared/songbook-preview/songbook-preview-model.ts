// Songbook preview UI contract — what `<app-songbook-preview>` is handed.
//
// Declared here rather than imported from `shared/data-access`, which the import
// ladder forbids this folder from touching (PRD-UI-SHELL.md §3). Structurally the
// download service's own `SongbookPreview`, narrowed to what the pane reads, so a
// drift between the two breaks the presenter's build, the one place that spans
// both. The same trick `transfer-model.ts` plays for the download dialogs.

/** Where a corner page number sits; `before-title` means it is in the heading. */
export type PreviewPageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left'
  | 'before-title';

/** One sheet: what it is, its printed number, and its render once drawn. */
export interface SongbookPreviewSheet {
  readonly kind: 'title' | 'summary' | 'song';
  /** The printed number, or null for front matter. */
  readonly number: number | null;
  /** The sheet's SVG, or null while it has not been drawn yet. */
  readonly svg: string | null;
}

/** The whole book as the pane shows it: its paper, and every sheet. */
export interface SongbookPreviewModel {
  /** width / height of the paper each sheet shows on. */
  readonly aspect: number;
  /** The margin as a fraction of the paper's width and height. */
  readonly marginRatioX: number;
  readonly marginRatioY: number;
  readonly pageNumberPosition: PreviewPageNumberPosition;
  readonly hasCornerNumbers: boolean;
  readonly pages: readonly SongbookPreviewSheet[];
}
