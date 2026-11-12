// SongSiteFlow — plans/import-chord-sheets.md phase 6 (Q15–Q20, Q59–Q62).
//
// The one state behind the Song site dialog and the Song preview dialog. The two
// replace each other rather than stack (Q18), so what Back returns to has to
// outlive the dialog that showed it: it lives here, for as long as the flow is
// open, and a shell host (`song-site-host.ts`) mounts the dialogs over it — the
// same arrangement as ImportInbox and `import-host.ts`, and for the same reason:
// `app/shared` may not reach data-access, and the flow starts from more than
// one page.

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ChordTheory,
  convertChordSheet,
  type Song,
} from '@achordeon/shared/domain';
import { ParserService } from '../parser/parser-service';
import { SONG_REPOSITORY } from '../stores/repositories';
import {
  SongSiteError,
  SongSiteService,
  type SongSite,
  type SongSiteFailure,
  type SongSiteGroup,
  type SongSiteSong,
} from './song-site-service';

export type SongSiteView = 'search' | 'preview';

/** The song as the preview shows it and Import would write it (Q19, Q20). */
export interface SongSitePreview {
  readonly song: SongSiteSong;
  /** Which of `song.versions` is shown; 0 when there is only one. */
  readonly version: number;
  /** "Title – Artist", the new Song's Name. */
  readonly name: string;
  /** The chosen version, converted: always English (Q8). */
  readonly content: string;
}

/** Fewer characters than this find everything, so nothing is asked (Q59). */
const QUERY_MIN = 2;

@Injectable({ providedIn: 'root' })
export class SongSiteFlow {
  private readonly songSites = inject(SongSiteService);
  private readonly theory = inject(ChordTheory);
  private readonly songs = inject(SONG_REPOSITORY);
  private readonly parser = inject(ParserService);

  private readonly _isOpen = signal(false);
  private readonly _view = signal<SongSiteView>('search');
  private readonly _sites = signal<readonly SongSite[]>([]);
  private readonly _query = signal('');
  private readonly _groups = signal<readonly SongSiteGroup[] | null>(null);
  private readonly _failure = signal<SongSiteFailure | null>(null);
  private readonly _isBusy = signal(false);
  private readonly _song = signal<SongSiteSong | null>(null);
  private readonly _version = signal(0);

  readonly isOpen = this._isOpen.asReadonly();
  readonly view = this._view.asReadonly();
  /** Names and link hints, from the function (Q14). */
  readonly sites = this._sites.asReadonly();
  /** The input as typed, kept for Back (Q18). */
  readonly query = this._query.asReadonly();
  /** The last search's answer, per site; null before the first search. */
  readonly groups = this._groups.asReadonly();
  /** Why the last request came to nothing, for the dialog to word (Q62). */
  readonly failure = this._failure.asReadonly();
  readonly isBusy = this._isBusy.asReadonly();
  readonly isAvailable = computed(() => this.songSites.isAvailable());

  readonly preview = computed<SongSitePreview | null>(() => {
    const song = this._song();
    if (!song) return null;
    const version = this._version();
    const text = song.versions?.[version]?.text ?? song.text;
    return {
      song,
      version,
      name: song.artist ? `${song.title} – ${song.artist}` : song.title,
      content: this.convert(text, song),
    };
  });

  /** Start over on an empty search, and learn which sites there are. */
  async open(): Promise<void> {
    this._isOpen.set(true);
    this._view.set('search');
    this._query.set('');
    this._groups.set(null);
    this._failure.set(null);
    await this.run(async () => this._sites.set(await this.songSites.sites()));
  }

  /**
   * Enter or Search (Q59). A link is fetched as the song it points at, anything
   * else is searched for on every site (Q15); the function decides whether a
   * link is one it can read.
   */
  async submit(input: string): Promise<void> {
    this._query.set(input);
    const q = input.trim();
    if (q.length < QUERY_MIN) return;
    if (isLink(q)) {
      await this.run(async () =>
        this.show(await this.songSites.song({ url: q })),
      );
    } else {
      await this.run(async () =>
        this._groups.set(await this.songSites.search(q)),
      );
    }
  }

  /** A search result, into the preview (Q19). */
  async choose(site: number, id: string): Promise<void> {
    await this.run(async () =>
      this.show(await this.songSites.song({ site, id })),
    );
  }

  /**
   * The preview, as one new Song (Q20): no Import preview and no duplicate
   * check, because one song chosen by hand is not a file that might collide.
   * Closes the flow and returns the new id, for the caller to open the editor;
   * null when there was nothing to import.
   */
  async importSong(): Promise<string | null> {
    const preview = this.preview();
    if (!preview) return null;
    const now = Date.now();
    const ast = this.parser.parse(preview.content);
    const song: Song = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: preview.name,
      content: preview.content,
      favorite: false,
      settings: {},
      cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
    };
    await this.songs.put(song);
    this.close();
    return song.id;
  }

  /** Done, either way: nothing of this search is kept for next time. */
  close(): void {
    this._isOpen.set(false);
    this._song.set(null);
  }

  /** Another of the site's versions of the same song (Q19). */
  chooseVersion(index: number): void {
    const count = this._song()?.versions?.length ?? 1;
    if (index >= 0 && index < count) this._version.set(index);
  }

  /** To the search as it was left: input, results and all, no new request (Q18). */
  back(): void {
    this._view.set('search');
    this._failure.set(null);
  }

  private show(song: SongSiteSong): void {
    this._song.set(song);
    this._version.set(0);
    this._view.set('preview');
  }

  /**
   * Into Achordeon markup, the way the editor's Convert button does it: a sheet
   * the detector would not call one is still read as chord rows, because coming
   * from a song site already says it is one.
   */
  private convert(text: string, song: SongSiteSong): string {
    const choices = { title: song.title, artist: song.artist };
    let result = convertChordSheet(text, this.theory, choices);
    if (result.kind !== 'converted') {
      result = convertChordSheet(text, this.theory, {
        ...choices,
        format: 'chord-rows',
      });
    }
    return result.kind === 'converted' ? result.content : text;
  }

  /** A request with the busy flag up, and its failure kept for the dialog. */
  private async run(job: () => Promise<void>): Promise<void> {
    this._isBusy.set(true);
    this._failure.set(null);
    try {
      await job();
    } catch (error) {
      this._failure.set(
        error instanceof SongSiteError ? error.reason : 'unavailable',
      );
    } finally {
      this._isBusy.set(false);
    }
  }
}

/** Typed text that is a web link, rather than words to search for. */
function isLink(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
