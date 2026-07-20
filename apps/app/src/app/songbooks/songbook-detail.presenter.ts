// Songbook detail presenter — Epic 6 ▸ subtasks 2–6
// Spec: CONTEXT.md §Songbook, §Song explorer; PRD-UI-SHELL.md §3, §4

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_SORT_DIR,
  SessionStore,
  SettingsStore,
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
import {
  RowSelection,
  type ExplorerSort,
  type ExplorerSortDir,
  type SongRow,
  type SortChange,
} from '../shared/song-explorer';
import {
  insertEntries,
  insertionIndex,
  moveEntries,
  removeEntries,
  shiftSelection,
  type InsertPosition,
  type MoveWhere,
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
  private readonly settings = inject(SettingsStore);
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

  /**
   * The book's name — and **empty, not "All songs", while a real one loads**.
   *
   * The fallback used to be the virtual name for any null book, which is a lie
   * for the two ticks a deep link takes to read its record. It is also load
   * bearing: the action bar's heading is a rename field bound to this, so a
   * value that arrives late overwrites what the user has already typed into it.
   */
  readonly name = computed(() =>
    this.isVirtual()
      ? $localize`:@@songbooks.allSongs:All songs`
      : (this._book()?.name ?? ''),
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

  /**
   * The library selection — **this screen's, not the app's**.
   *
   * It used to be `SessionStore`'s one set, so songs ticked in the Songs module
   * arrived here already selected and armed against the Add buttons (see
   * `RowSelection`).
   */
  private readonly selection = new RowSelection();

  readonly selectedIds = this.selection.ids;
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

  /** The row body: pick exactly this song, and make it the current one — so a
   * click is enough to then press Add (see `RowSelection`). */
  activate(id: Uuid): void {
    this.selection.selectOnly(id);
    this.session.setCurrentSong(id);
  }

  toggleSelect(id: Uuid): void {
    this.selection.toggle(id);
  }

  clearSelection(): void {
    this.selection.clear();
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
    const selected = this.selection.ids();
    if (!book || this.isVirtual() || selected.size === 0) {
      return;
    }
    const songIds = this.rows()
      .map((row) => row.id)
      .filter((id) => selected.has(id));
    const at = this.insertAt(where) ?? book.entries.length;

    await this.writeEntries(insertEntries(book.entries, songIds, at));
    this._selectedSlots.set(
      shiftSelection(this._selectedSlots(), at, songIds.length),
    );
    // The songs have landed. Leaving them ticked invites a second, accidental
    // copy of the same set on the next press of a neighbouring button.
    this.selection.clear();
  }

  /**
   * Where `where` would put them, right now — the number the Add buttons show
   * and the entry list draws a line at (fix: "there is no clear information
   * where it puts the songs").
   *
   * Null when there is nothing to add, so the preview does not promise a
   * position for a press that would do nothing.
   */
  insertAt(where: InsertPosition): number | null {
    const book = this._book();
    if (!book || this.isVirtual() || this.selection.isEmpty()) {
      return null;
    }
    return insertionIndex(book.entries.length, this._selectedSlots(), where);
  }

  /**
   * Reorder the selected slots (songbooks/index.mdx).
   *
   * Refused outright on the virtual book: *All songs* has a read-only order
   * (CONTEXT.md §Songbook), and there is no record to write a new one to.
   */
  async moveSelected(where: MoveWhere): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual() || this._selectedSlots().size === 0) {
      return;
    }
    const moved = moveEntries(book.entries, this._selectedSlots(), where);
    await this.writeEntries(moved.entries);
    // The selection travels with the slots, or the next press moves whatever
    // happened to slide into those indexes.
    this._selectedSlots.set(moved.selected);
  }

  /**
   * Remove slots from this book. **No confirmation, on purpose**: nothing is
   * destroyed — the song stays in the library, and putting it back is two clicks
   * on the list already open beside it (CONTEXT.md §Delete vs Remove). A dialog
   * here would train the user to click through the one that guards a real
   * delete.
   */
  async removeSlots(indexes: readonly number[]): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual() || indexes.length === 0) {
      return;
    }
    const dropped = new Set(indexes);
    await this.writeEntries(removeEntries(book.entries, dropped));
    // Every surviving index has shifted; nothing is left to point at, so the
    // selection goes rather than silently coming to mean other slots.
    this._selectedSlots.set(new Set());
  }

  // --- The book itself: name, title page, and its scope of the cascade. ----

  /** Title-page fields — **authored via GUI, never parsed** from any song's
   * content (PRD-DOMAIN-MODEL §Songbook; ADR-0001). */
  readonly titleFields = computed(() => ({
    title: this._book()?.title ?? '',
    subtitle: this._book()?.subtitle ?? '',
    author: this._book()?.author ?? '',
  }));

  /** This scope's sparse overrides (ADR-0006), for the settings panel. */
  readonly songbookSettings = computed(
    () => (this._book()?.settings ?? {}) as Record<string, unknown>,
  );

  /**
   * What this scope inherits: the Global defaults, which are the only thing
   * below it in the cascade (ADR-0006). The panel needs them for the
   * "inherited" badge and as the value it draws while nothing is overridden.
   */
  readonly inheritedSettings = computed(
    () => this.settings.global() as Record<string, unknown>,
  );

  private readonly _isSettingsOpen = signal(false);
  readonly isSettingsOpen = this._isSettingsOpen.asReadonly();

  toggleSettings(): void {
    this._isSettingsOpen.update((open) => !open);
  }

  closeSettings(): void {
    this._isSettingsOpen.set(false);
  }

  async rename(name: string): Promise<void> {
    await this.patchBook({ name });
  }

  async setTitleField(
    field: 'title' | 'subtitle' | 'author',
    value: string,
  ): Promise<void> {
    await this.patchBook({ [field]: value });
  }

  /**
   * A sparse patch from the settings panel — **the songbook theme** that
   * re-styles every song performed in this book (CONTEXT.md §Render settings).
   *
   * `undefined` for a key means "reset to inherited", which at this scope is a
   * **deletion**, not a write of the global value: overrides are stored sparse
   * so the cascade can keep resolving through them (ADR-0006).
   */
  async patchSettings(patch: Record<string, unknown>): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual()) {
      return;
    }
    const settings: Record<string, unknown> = { ...book.settings };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete settings[key];
      } else {
        settings[key] = value;
      }
    }
    await this.patchBook({ settings: settings as Songbook['settings'] });
  }

  private async patchBook(changes: Partial<Songbook>): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual()) {
      return;
    }
    const updated: Songbook = { ...book, ...changes, updatedAt: Date.now() };
    this._book.set(updated);
    await this.books.upsert(updated);
  }

  /** The library, in the virtual book's own (name) order. */
  private async refreshVirtual(): Promise<void> {
    this._allSongIds.set((await this.songs.allLive()).map((song) => song.id));
  }

  /** Persist a new order and keep the entry list able to name its slots. */
  private async writeEntries(entries: Uuid[]): Promise<void> {
    await this.patchBook({ entries });
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
