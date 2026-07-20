// Songbook detail presenter — Epic 6 ▸ subtask 2
// Spec: CONTEXT.md §Songbook, §Song explorer; PRD-UI-SHELL.md §3, §4

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_SORT_DIR,
  SessionStore,
  SongStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import {
  ALL_SONGS_ID,
  isAllSongs,
  type Songbook,
  type Uuid,
} from '@achordeon/shared/domain';
import type {
  ExplorerSort,
  ExplorerSortDir,
  SongRow,
  SortChange,
} from '../shared/song-explorer';

/**
 * The songbook builder's half of the app's state.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3). It serves **two books that are
 * not the same kind of thing**: a stored `Songbook`, and the virtual *All songs*
 * — which has no record, no settings and no editable order. Everything that
 * writes therefore asks `isVirtual` first, in one place, rather than each button
 * remembering.
 */
@Injectable()
export class SongbookDetailPresenter {
  private readonly books = inject(SongbookStore);
  private readonly songs = inject(SongStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The book being built, or null for the virtual one (and while loading). */
  private readonly _book = signal<Songbook | null>(null);
  private readonly _id = signal<Uuid>(ALL_SONGS_ID);
  /** The virtual book's entries: the whole library, name-ordered, read-only. */
  private readonly _allSongIds = signal<readonly Uuid[]>([]);

  readonly id = this._id.asReadonly();
  readonly isVirtual = computed(() => isAllSongs(this._id()));

  /** True once the route's book is known — a missing id must not read as empty. */
  private readonly _isFound = signal(false);
  readonly isFound = this._isFound.asReadonly();

  readonly name = computed(
    () => this._book()?.name ?? $localize`:@@songbooks.allSongs:All songs`,
  );

  // --- Pane A: the library, in reduced-capability form. -------------------

  readonly rows = computed<SongRow[]>(() =>
    this.songs.live().map((song) => ({
      id: song.id,
      name: song.name,
      title: song.cache.title,
      subtitle: song.cache.subtitle,
      isFavorite: song.favorite,
    })),
  );

  readonly selectedIds = this.session.selectedIds;
  readonly currentId = this.session.currentSongId;
  readonly isLoaded = this.songs.loaded;

  /**
   * Load the book and the library behind it.
   *
   * The book is read from the **repository**, not the songbook window: this is a
   * deep link (the in-use delete warning links straight here), so the list it
   * came from may never have been loaded.
   */
  async load(id: string): Promise<void> {
    this._id.set(id);
    if (isAllSongs(id)) {
      this._book.set(null);
      this._isFound.set(true);
      await this.refreshVirtual();
      return;
    }
    const book = await this.books.byId(id);
    this._book.set(book ?? null);
    this._isFound.set(book !== undefined && book.deletedAt === null);
  }

  /** Keep the store's query in line with the URL — the URL is the source of
   * truth for search and sort (§7), exactly as on `/songs`. */
  async syncQuery(params: {
    query: string;
    sort: ExplorerSort;
    dir?: ExplorerSortDir;
  }): Promise<void> {
    const isSortStale =
      params.sort !== this.songs.sort() || params.dir !== this.songs.dir();
    const isQueryStale = params.query !== this.songs.query();

    if (isSortStale) {
      await this.songs.setSort(params.sort, params.dir);
    }
    if (isQueryStale) {
      await this.songs.setSearch(params.query);
    }
    if (!isSortStale && !isQueryStale && !this.songs.loaded()) {
      await this.songs.load();
    }
  }

  effectiveDir(sort: ExplorerSort, dir?: ExplorerSortDir): ExplorerSortDir {
    return dir ?? DEFAULT_SORT_DIR[sort];
  }

  loadMore(): void {
    void this.songs.loadMore();
  }

  setQuery(query: string): void {
    this.navigate({ q: query || null });
  }

  setSort(change: SortChange): void {
    this.navigate({ sort: change.key, dir: change.dir ?? null });
  }

  activate(id: Uuid): void {
    this.session.setCurrentSong(id);
  }

  toggleSelect(id: Uuid): void {
    this.session.toggle(id);
  }

  clearSelection(): void {
    this.session.clearSelection();
  }

  /**
   * Favorite is a **library** fact, not a songbook one, so it survives the
   * reduced capability set: it changes nothing about this book and is the one
   * way to mark a song while you are picking (CONTEXT.md §Song explorer).
   */
  async toggleFavorite(id: Uuid): Promise<void> {
    const song = this.songs.entities().find((s) => s.id === id);
    if (song) {
      await this.songs.upsert({
        ...song,
        favorite: !song.favorite,
        updatedAt: Date.now(),
      });
      await this.songs.refresh();
    }
  }

  /**
   * The current book's slots, in order.
   *
   * One list for both kinds of book: the stored one carries its own `entries`,
   * the virtual one *is* the library. Everything downstream reads this and never
   * has to ask which book it is looking at.
   */
  readonly entryIds = computed<readonly Uuid[]>(() =>
    this.isVirtual() ? this._allSongIds() : (this._book()?.entries ?? []),
  );

  /** The library, in the virtual book's own (name) order. */
  private async refreshVirtual(): Promise<void> {
    this._allSongIds.set((await this.songs.allLive()).map((song) => song.id));
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
