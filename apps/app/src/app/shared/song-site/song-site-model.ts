// Song site UI contract — plans/import-chord-sheets.md phase 6.
//
// The vocabulary the Song site dialog and the Song preview dialog speak.
// Declared here rather than imported from data-access, which `app/shared` may
// not touch: structurally the flow's own types, mapped by the shell host, the
// same trick `transfer-model.ts` plays for the Import preview.

/** What went wrong, for the dialog to word (plan Q62). */
export type SongSiteFailureCode =
  | 'rate-limited'
  | 'unsupported-url'
  | 'not-found'
  | 'timeout'
  | 'unavailable';

export interface SongSiteResult {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
}

/** One site's results, in the site's own order (plan Q16). */
export interface SongSiteResultGroup {
  readonly site: number;
  readonly siteName: string;
  /** Why this site has nothing to show: it failed or took too long. */
  readonly notice?: 'timeout' | 'unavailable';
  readonly results: readonly SongSiteResult[];
}

/** A search result the person picked. */
export interface SongSitePick {
  readonly site: number;
  readonly id: string;
}
