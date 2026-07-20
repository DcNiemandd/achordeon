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
  type Song,
  type Songbook,
  type Uuid,
} from '@achordeon/shared/domain';
import type {
  ExplorerSort,
  ExplorerSortDir,
  SongRow,
  SortChange,
} from '../shared/song-explorer';
import {
  insertEntries,
  insertionIndex,
  shiftSelection,
  type InsertPosition,
} from './entry-ops';
import type { EntryRow } from './songbook-entries';

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
    this._selectedSlots.set(new Set());
    if (isAllSongs(id)) {
      this._book.set(null);
      this._isFound.set(true);
      await this.refreshVirtual();
    } else {
      const book = await this.books.byId(id);
      this._book.set(book ?? null);
      this._isFound.set(book !== undefined && book.deletedAt === null);
    }
    await this.hydrate();
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

  // --- Pane B: the songbook's own order. ----------------------------------

  /**
   * The songs an entry list needs to name its slots.
   *
   * Kept beside the window rather than read out of it: an entry may point at a
   * song the explorer's current query never returned — a search is on, or the
   * book is longer than the loaded page — and a slot that renders as blank
   * because of what is typed in the search box is not a slot the user can work
   * with.
   */
  private readonly _songsById = signal<ReadonlyMap<Uuid, Song>>(new Map());

  /** Which **slots** are ticked. Indexes, not ids: the same song may fill
   * several slots, and they are not interchangeable. */
  private readonly _selectedSlots = signal<ReadonlySet<number>>(new Set());
  readonly selectedSlots = this._selectedSlots.asReadonly();

  readonly entries = computed<EntryRow[]>(() => {
    const byId = this._songsById();
    return this.entryIds().map((songId, index) => {
      const song = byId.get(songId);
      return {
        index,
        songId,
        // A slot whose song is gone should not exist — deleting a song cascades
        // out of every songbook — so this names the fault rather than drawing a
        // blank row that looks like a bug in the list.
        name: song?.name ?? $localize`:@@entries.missing:Missing song`,
        title: song?.cache.title ?? '',
      };
    });
  });

  toggleSelectSlot(index: number): void {
    this._selectedSlots.update((set) => {
      const next = new Set(set);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });
  }

  clearSlotSelection(): void {
    this._selectedSlots.set(new Set());
  }

  /**
   * Add the songs selected on the left into this book (songbooks/index.mdx).
   *
   * The songs go in **the order the library list is showing them**, not the
   * order they happened to be ticked: what you see is what you get, and a
   * selection has no order of its own to preserve.
   */
  async addSelected(where: InsertPosition): Promise<void> {
    const book = this._book();
    const selected = this.session.selectedIds();
    if (!book || this.isVirtual() || selected.size === 0) {
      return;
    }
    const songIds = this.rows()
      .map((row) => row.id)
      .filter((id) => selected.has(id));
    const at = insertionIndex(
      book.entries.length,
      this._selectedSlots(),
      where,
    );

    await this.writeEntries(insertEntries(book.entries, songIds, at));
    this._selectedSlots.set(
      shiftSelection(this._selectedSlots(), at, songIds.length),
    );
  }

  /** The library, in the virtual book's own (name) order. */
  private async refreshVirtual(): Promise<void> {
    this._allSongIds.set((await this.songs.allLive()).map((song) => song.id));
  }

  /** Persist a new order and keep the entry list naming its slots. */
  private async writeEntries(entries: Uuid[]): Promise<void> {
    const book = this._book();
    if (!book) {
      return;
    }
    const updated: Songbook = { ...book, entries, updatedAt: Date.now() };
    this._book.set(updated);
    await this.books.upsert(updated);
    await this.hydrate();
  }

  /**
   * Fetch the songs this book's slots point at, for the ones not already known.
   *
   * By id from the repository, because that is the only query that answers
   * "this song" regardless of the list's sort, search or scroll position.
   */
  private async hydrate(): Promise<void> {
    const known = this._songsById();
    const missing = [...new Set(this.entryIds())].filter(
      (id) => !known.has(id),
    );
    if (missing.length === 0) {
      return;
    }
    const found = await Promise.all(missing.map((id) => this.songs.byId(id)));
    const next = new Map(known);
    for (const song of found) {
      if (song) {
        next.set(song.id, song);
      }
    }
    this._songsById.set(next);
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
