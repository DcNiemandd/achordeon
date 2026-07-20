// Songbook detail presenter — Epic 6 ▸ subtasks 2–6
// Spec: CONTEXT.md §Songbook, §Song explorer; PRD-UI-SHELL.md §3, §4

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_SORT_DIR,
  DownloadService,
  ExportService,
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
import type { SongbookPdfChoice } from '../shared/transfer';
import {
  insertEntries,
  insertionIndex,
  moveEntries,
  moveEntriesTo,
  removeEntries,
  shiftSelection,
  type InsertPosition,
  type MoveWhere,
} from './entry-ops';

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
  private readonly downloads = inject(DownloadService);
  private readonly exporter = inject(ExportService);
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
    this.songs.live().map((song, index) => ({
      id: song.id,
      position: index,
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
    this.slotSelection.clear();
    this._currentSlotKey.set(null);
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
    isFavoritesFirst: boolean;
  }): Promise<void> {
    const isSortStale =
      params.sort !== this.songs.sort() || params.dir !== this.songs.dir();
    const isQueryStale = params.query !== this.songs.query();
    const isFavoriteStale =
      params.isFavoritesFirst !== this.songs.favoritesFirst();

    if (isSortStale) {
      await this.songs.setSort(params.sort, params.dir);
    }
    if (isFavoriteStale) {
      await this.songs.setFavoritesFirst(params.isFavoritesFirst);
    }
    if (isQueryStale) {
      await this.songs.setSearch(params.query);
    }
    if (
      !isSortStale &&
      !isQueryStale &&
      !isFavoriteStale &&
      !this.songs.loaded()
    ) {
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

  setFavoritesFirst(isFirst: boolean): void {
    this.navigate({ fav: isFirst ? '1' : null });
  }

  // --- The virtual book's own order ---------------------------------------

  /**
   * How **All songs** is sorted.
   *
   * It is the one thing that book can be told: it has no arrangement of its own
   * to protect (CONTEXT.md §Songbook — read-only order), so "sorted how" is the
   * only question it can answer. Kept here rather than in the URL because it
   * belongs to one pane of one book, not to the screen's address.
   */
  private readonly _entrySort = signal<ExplorerSort>('name');
  private readonly _entryDir = signal<ExplorerSortDir | undefined>(undefined);
  private readonly _entryFavoritesFirst = signal(false);

  readonly entrySort = this._entrySort.asReadonly();
  readonly entryDir = computed(
    () => this._entryDir() ?? DEFAULT_SORT_DIR[this._entrySort()],
  );
  readonly isEntryFavoritesFirst = this._entryFavoritesFirst.asReadonly();

  async setEntrySort(change: SortChange): Promise<void> {
    this._entrySort.set(change.key);
    this._entryDir.set(change.dir);
    await this.refreshVirtual();
  }

  async setEntryFavoritesFirst(isFirst: boolean): Promise<void> {
    this._entryFavoritesFirst.set(isFirst);
    await this.refreshVirtual();
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

  /**
   * Which **slots** are ticked, by slot key — the same `RowSelection` the
   * library list uses, so both panes answer a click identically (the row picks
   * one, the checkbox extends). The key is the position, never the song id: the
   * same song may fill several slots and they are not interchangeable.
   */
  private readonly slotSelection = new RowSelection();

  readonly selectedSlots = this.slotSelection.ids;

  /** The ticked slots as indexes, which is what `entry-ops` speaks. */
  private selectedIndexes(): Set<number> {
    return new Set([...this.slotSelection.ids()].map(Number));
  }

  /**
   * The songbook's slots, in the **same row shape the library list uses** — it
   * is the same component (`ENTRY_CAPABILITIES`), so it is the same contract.
   */
  readonly entries = computed<SongRow[]>(() => {
    const byId = this._songsById();
    return this.entryIds().map((songId, index) => {
      const song = byId.get(songId);
      return {
        id: String(index),
        position: index,
        // A slot whose song is gone should not exist — deleting a song cascades
        // out of every songbook — so this names the fault rather than drawing a
        // blank row that looks like a bug in the list.
        name: song?.name ?? $localize`:@@entries.missing:Missing song`,
        title: song?.cache.title ?? '',
        subtitle: song?.cache.subtitle ?? '',
        isFavorite: false,
      };
    });
  });

  /** The slot the user last clicked, which is not derivable from the song. */
  private readonly _currentSlotKey = signal<string | null>(null);

  /**
   * The slot the rest of the app is pointing at, or null.
   *
   * Rows are keyed by slot, so "the current song" has to be translated into one
   * of them — and **the one you clicked**, not merely the first that holds that
   * song [corrected]. With a song in three slots, clicking the second lit the
   * first: the mark went to a twin, and two rows appeared active at once.
   *
   * The remembered slot is only honoured while it still holds the current song.
   * When the song was made current from somewhere else — Epic 5's in-use warning
   * links here with a song already selected — there is no clicked slot to
   * honour, and the first one holding it is the honest answer.
   */
  readonly currentSlot = computed(() => {
    const current = this.session.currentSongId();
    if (current === null) {
      return null;
    }
    const ids = this.entryIds();
    const clicked = this._currentSlotKey();
    if (clicked !== null && ids[Number(clicked)] === current) {
      return clicked;
    }
    const at = ids.findIndex((songId) => songId === current);
    return at === -1 ? null : String(at);
  });

  toggleSelectSlot(key: string): void {
    this.slotSelection.toggle(key);
  }

  /** A click on a slot's body: pick just it, and make its song current. */
  activateSlot(key: string): void {
    this.slotSelection.selectOnly(key);
    const songId = this.entryIds()[Number(key)];
    if (songId !== undefined) {
      this._currentSlotKey.set(key);
      this.session.setCurrentSong(songId);
    }
  }

  clearSlotSelection(): void {
    this.slotSelection.clear();
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
    this.setSlotSelection(
      shiftSelection(this.selectedIndexes(), at, songIds.length),
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
    return insertionIndex(book.entries.length, this.selectedIndexes(), where);
  }

  /**
   * Reorder the selected slots (songbooks/index.mdx).
   *
   * Refused outright on the virtual book: *All songs* has a read-only order
   * (CONTEXT.md §Songbook), and there is no record to write a new one to.
   */
  async moveSelected(where: MoveWhere): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual() || this.slotSelection.isEmpty()) {
      return;
    }
    const moved = moveEntries(book.entries, this.selectedIndexes(), where);
    await this.writeEntries(moved.entries);
    // The selection travels with the slots, or the next press moves whatever
    // happened to slide into those indexes.
    this.setSlotSelection(moved.selected);
  }

  /**
   * Move **one slot**, named by key — the row's own buttons, which act on the
   * row you are pointing at and never on the selection.
   *
   * The ticks are carried along rather than cleared: they belong to a different
   * gesture (the strip above), and a row move must not quietly disarm it. The
   * order is computed over a list of *positions* and then applied to both, so
   * the two can never disagree about where anything went.
   */
  async moveSlot(key: string, where: MoveWhere): Promise<void> {
    const book = this._book();
    const index = Number(key);
    if (!book || this.isVirtual() || !Number.isInteger(index)) {
      return;
    }
    const positions = book.entries.map((_, at) => String(at));
    const moved = moveEntries(positions, new Set([index]), where);
    const wasSelected = this.selectedIndexes();

    await this.writeEntries(
      moved.entries.map((position) => book.entries[Number(position)]),
    );
    this.setSlotSelection(
      new Set(
        moved.entries
          .map((position, at) => (wasSelected.has(Number(position)) ? at : -1))
          .filter((at) => at >= 0),
      ),
    );
  }

  /**
   * A row dropped onto the entry list (Epic 14) — the drag half of the Add
   * buttons.
   *
   * **The selection rule is the buttons'**: a dragged row that is part of the
   * selection carries the whole of it, because that is what the user built the
   * selection for. Dragging a row that is *not* selected means that row and
   * nothing else — the gesture named its own subject, and hijacking it into the
   * selection would move songs the pointer never touched.
   */
  async dropIntoEntries(songId: string, at: number): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual()) {
      return;
    }
    const selected = this.selection.ids();
    const songIds = selected.has(songId)
      ? this.rows()
          .map((row) => row.id)
          .filter((id) => selected.has(id))
      : [songId];

    await this.writeEntries(insertEntries(book.entries, songIds, at));
    this.setSlotSelection(
      shiftSelection(this.selectedIndexes(), at, songIds.length),
    );
    this.selection.clear();
  }

  /**
   * A slot dropped back into the entry list: a reorder to an arbitrary
   * boundary, which is the one thing the four move buttons cannot express.
   *
   * Same selection rule as the drop above, and the same reason.
   */
  async dropReorder(key: string, at: number): Promise<void> {
    const book = this._book();
    const index = Number(key);
    if (!book || this.isVirtual() || !Number.isInteger(index)) {
      return;
    }
    const selected = this.selectedIndexes();
    const moving = selected.has(index) ? selected : new Set([index]);
    // Over a list of positions, then applied to both the order and the ticks —
    // the same trick `moveSlot` uses, and for the same reason: dragging an
    // *unselected* row still shifts every ticked index around it, and a
    // selection that stayed at its old numbers would come to mean other slots.
    const positions = book.entries.map((_, slot) => String(slot));
    const moved = moveEntriesTo(positions, moving, at);

    await this.writeEntries(
      moved.entries.map((position) => book.entries[Number(position)]),
    );
    this.setSlotSelection(
      new Set(
        moved.entries
          .map((position, slot) => (selected.has(Number(position)) ? slot : -1))
          .filter((slot) => slot >= 0),
      ),
    );
  }

  /**
   * Remove slots from this book. **No confirmation, on purpose**: nothing is
   * destroyed — the song stays in the library, and putting it back is two clicks
   * on the list already open beside it (CONTEXT.md §Delete vs Remove). A dialog
   * here would train the user to click through the one that guards a real
   * delete.
   */
  async removeSlots(keys: readonly string[]): Promise<void> {
    const book = this._book();
    if (!book || this.isVirtual() || keys.length === 0) {
      return;
    }
    const dropped = new Set(keys.map(Number));
    await this.writeEntries(removeEntries(book.entries, dropped));
    // Every surviving index has shifted; nothing is left to point at, so the
    // selection goes rather than silently coming to mean other slots.
    this.slotSelection.clear();
  }

  /** Put back a slot selection that `entry-ops` computed in index form. */
  private setSlotSelection(indexes: ReadonlySet<number>): void {
    this.slotSelection.clear();
    for (const index of indexes) {
      this.slotSelection.toggle(String(index));
    }
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

  /** The library, in the virtual book's own order — see `_entrySort`. */
  private async refreshVirtual(): Promise<void> {
    if (!this.isVirtual()) {
      return;
    }
    const songs = await this.songs.allLive({
      sort: this._entrySort(),
      dir: this._entryDir(),
      favoritesFirst: this._entryFavoritesFirst(),
    });
    this._songsById.set(new Map(songs.map((song) => [song.id, song])));
    this._allSongIds.set(songs.map((song) => song.id));
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

  // --- Transfer (Epic 7) -----------------------------------------------
  //
  // The same two acts the songbook list offers, on the book that is already
  // open. **Off for the virtual All songs**, which has no record and therefore
  // no title page, author or order of its own to print.

  private readonly _isDownloadOpen = signal(false);
  private readonly _isBusy = signal(false);
  readonly isDownloadOpen = this._isDownloadOpen.asReadonly();
  readonly isBusy = this._isBusy.asReadonly();

  readonly isTransferable = computed(
    () => !this.isVirtual() && this._book() !== null,
  );

  openDownload(): void {
    if (this.isTransferable()) this._isDownloadOpen.set(true);
  }

  cancelDownload(): void {
    this._isDownloadOpen.set(false);
  }

  async download(choice: SongbookPdfChoice): Promise<void> {
    this._isDownloadOpen.set(false);
    if (!this.isTransferable()) return;
    await this.busy(() => this.downloads.downloadSongbook(this._id(), choice));
  }

  async exportBook(): Promise<void> {
    if (!this.isTransferable()) return;
    await this.busy(() => this.exporter.export({ songbookIds: [this._id()] }));
  }

  private async busy(job: () => Promise<unknown>): Promise<void> {
    this._isBusy.set(true);
    try {
      await job();
    } finally {
      this._isBusy.set(false);
    }
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
