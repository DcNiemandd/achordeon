// Song sites transport — plans/import-chord-sheets.md phase 6.
// Spec: supabase/functions/song-sites (the other half), ADR-0019.
//
// The app knows a Song site only by its number; names and link hints come from
// the function. This file knows the contract and the failure codes, never a
// site, and never the wording: the dialog owns that.

import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../lobby/supabase-client';

/** A site, as the function introduces it. */
export interface SongSite {
  readonly site: number;
  readonly name: string;
  /** Where a link the function can read comes from, e.g. `plnyzpevnik.cz`. */
  readonly urlHint: string;
}

export interface SongSiteHit {
  /** The site's id for the song. Opaque: only handed back to `song`. */
  readonly id: string;
  readonly title: string;
  readonly artist: string;
}

/** One site's answer to a search, in the site's own order (plan Q16). */
export interface SongSiteGroup {
  readonly site: number;
  /** Why this site has no results: it failed or it took too long. */
  readonly groupError?: 'timeout' | 'unavailable';
  readonly results: readonly SongSiteHit[];
}

export interface SongSiteVersion {
  readonly label: string;
  readonly text: string;
}

/** A song as the site writes it, raw: the app converts it (plan, contract). */
export interface SongSiteSong {
  readonly site: number;
  readonly title: string;
  readonly artist: string;
  /** Every version, when the site has more than one. `text` is the first. */
  readonly versions?: readonly SongSiteVersion[];
  readonly text: string;
  readonly format: 'chordpro' | 'chord-sheet';
  /** The page a person would open, for "from <site>" (plan Q19). */
  readonly url: string;
}

/** Which song: a search result, or a link someone pasted (plan Q15). */
export type SongSiteRef =
  | { readonly site: number; readonly id: string }
  | { readonly url: string };

/** What went wrong, as the dialog words it (plan Q62). */
export type SongSiteFailure =
  | 'rate-limited'
  | 'unsupported-url'
  | 'not-found'
  | 'timeout'
  | 'unavailable';

export class SongSiteError extends Error {
  constructor(readonly reason: SongSiteFailure) {
    super(`song-site: ${reason}`);
    this.name = 'SongSiteError';
  }
}

const FUNCTION = 'song-sites';

/** Status → failure. Anything not listed is the site, or us, being down. */
const BY_STATUS: Readonly<Record<number, SongSiteFailure>> = {
  429: 'rate-limited',
  422: 'unsupported-url',
  404: 'not-found',
  504: 'timeout',
};

@Injectable({ providedIn: 'root' })
export class SongSiteService {
  private readonly supabase = inject(SupabaseService);
  private readonly online = signal(navigator.onLine);

  constructor() {
    const set = (value: boolean) => () => this.online.set(value);
    const goOnline = set(true);
    const goOffline = set(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    });
  }

  /** Whether a Song site can be reached at all: online, with a backend (Q61). */
  readonly isAvailable = (): boolean =>
    this.supabase.isConfigured && this.online();

  sites(): Promise<SongSite[]> {
    return this.call({ action: 'sites' });
  }

  search(q: string): Promise<SongSiteGroup[]> {
    return this.call({ action: 'search', q });
  }

  song(ref: SongSiteRef): Promise<SongSiteSong> {
    return this.call({ action: 'song', ...ref });
  }

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    const client = await this.supabase.client();
    if (!client) throw new SongSiteError('unavailable');
    const { data, error } = await client.functions.invoke(FUNCTION, { body });
    if (error) throw this.classify(error);
    return data as T;
  }

  /** `invoke` reports every non-2xx alike, with the Response on `context`. */
  private classify(error: unknown): SongSiteError {
    const status = (error as { context?: { status?: unknown } }).context
      ?.status;
    return new SongSiteError(
      (typeof status === 'number' && BY_STATUS[status]) || 'unavailable',
    );
  }
}
