// What every Song site adapter is (ADR-0019). The registry is `sites.ts`.

/** One song a search found. `id` is ours to read back, opaque to the app. */
export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
}

/** One way the site writes the song. */
export interface SongVersion {
  readonly label: string;
  readonly text: string;
}

export interface SongPage {
  readonly title: string;
  readonly artist: string;
  readonly versions: readonly SongVersion[];
}

/** Who is asking, said plainly to every site (ADR-0019, plan Q58). */
export const USER_AGENT =
  "Achordeon/1 (+https://achordeon.eu/app/; song import on a user's request)";

/** A site answered, but not with what was asked for. */
export class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`upstream ${status}`);
    this.name = 'UpstreamError';
  }
}

/** How a site is reached: `fetch`, or a fake of it in a test. */
export type Fetch = typeof globalThis.fetch;

export interface Site {
  /** What the app shows. */
  readonly name: string;
  /** Where a link the app can read comes from, for the input's description. */
  readonly urlHint: string;
  search(q: string, fetch: Fetch): Promise<SearchHit[]>;
  /** The song under one of our ids, or null when the site has no such song. */
  song(id: string, fetch: Fetch): Promise<SongPage | null>;
  /** Our id for a link to one of this site's songs, or null when it is not one. */
  idFromUrl(url: URL): string | null;
  /** The page a person would open for this id, for "from <site>" (plan Q19). */
  urlOf(id: string): string;
}
