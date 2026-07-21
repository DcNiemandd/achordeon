// Songs presenter — Epic 5 ▸ subtasks 1–2
// Spec: PRD-UI-SHELL.md §3 (the seam), §7 (state placement); CONTEXT.md §Song explorer

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_SORT_DIR,
  DownloadService,
  ExportService,
  ImportService,
  ParserService,
  RenderService,
  SessionStore,
  SettingsStore,
  SongStore,
  SongbookStore,
  type MultiFormat,
  type SongFormat,
} from '@achordeon/shared/data-access';
import {
  resolveSettings,
  type ImportPlan,
  type Song,
} from '@achordeon/shared/domain';
import {
  RowSelection,
  type ExplorerSort,
  type ExplorerSortDir,
  type SongRow,
  type SortChange,
} from '../shared/song-explorer';
import type {
  DownloadFormat,
  ImportChoice,
  ImportPreview,
} from '../shared/transfer';
import { TUTORIAL_CONTENT } from './new-song';

/** The name a song is born with, before the user has said what it is. */
const NEW_SONG_NAME = $localize`:@@songs.newName:New song`;

/** One place a song about to be deleted is still being used (CONTEXT.md §Delete
 * vs Remove). `songName` is carried because a bulk delete's warning spans songs. */
export interface SongUse {
  readonly bookId: string;
  readonly bookName: string;
  readonly songId: string;
  readonly songName: string;
}

/** Why a picked file could not be imported — the two the user can act on:
 * it is not one of ours, or it is from a build this one cannot read. */
export type ImportFailure = 'unreadable' | 'refused';

/** A delete the user has asked for and not yet confirmed. */
export interface PendingDelete {
  readonly ids: string[];
  readonly names: string[];
  readonly uses: SongUse[];
}

/**
 * The only thing in `songs/` that knows the business layer exists.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3). When the designed UI lands, the
 * components around this file are deleted and it keeps working — it never knew
 * what they looked like.
 *
 * It owns the **view model**, not the store's model: `rows` is what a list draws,
 * and nothing downstream of here has ever seen a `Song`.
 */
@Injectable()
export class SongsPresenter {
  private readonly store = inject(SongStore);
  private readonly songbooks = inject(SongbookStore);
  private readonly session = inject(SessionStore);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly downloads = inject(DownloadService);
  private readonly exporter = inject(ExportService);
  private readonly importer = inject(ImportService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly _pendingDelete = signal<PendingDelete | null>(null);
  private readonly _isDownloadOpen = signal(false);
  private readonly _isBusy = signal(false);
  private readonly _importPreview = signal<ImportPreview | null>(null);
  private readonly _importError = signal<ImportFailure | null>(null);
  /** The plan behind the preview. Kept out of the view model: the dialog asks a
   * question about it, it does not need to hold the records. */
  private importPlan: ImportPlan | null = null;

  /** The delete awaiting confirmation, or null. Session-only and the feature's,
   * like any transient dialog state (PRD-UI-SHELL.md §7). */
  readonly pendingDelete = this._pendingDelete.asReadonly();

  /** Transfer state (Epic 7): all session-only and all this screen's (§7). */
  readonly isDownloadOpen = this._isDownloadOpen.asReadonly();
  /** A render loop and a PDF are not instant, and a button that looks unpressed
   * while it works gets pressed again. */
  readonly isBusy = this._isBusy.asReadonly();
  readonly importPreview = this._importPreview.asReadonly();
  readonly importError = this._importError.asReadonly();

  readonly rows = computed<SongRow[]>(() =>
    this.store.live().map((song, index) => ({
      id: song.id,
      // Its place in the list as shown. The library never displays it — the
      // ordinal is a songbook's affordance — but the insertion preview and the
      // row contract are one shape for both mounts.
      position: index,
      name: song.name,
      // The parser cache, not a re-parse: it is stored derived state precisely so
      // that listing 500 songs costs no parsing (PRD-DOMAIN-MODEL §Song).
      title: song.cache.title,
      subtitle: song.cache.subtitle,
      isFavorite: song.favorite,
    })),
  );

  /** This screen's selection, and only this screen's (see `RowSelection`). */
  private readonly selection = new RowSelection();

  readonly selectedIds = this.selection.ids;
  readonly currentId = this.session.currentSongId;
  readonly isLoaded = this.store.loaded;

  /** What the bulk star would do — so the button can say so before it is pressed. */
  readonly isSelectionAllFavorite = computed(() => {
    const songs = [...this.selection.ids()]
      .map((id) => this.find(id))
      .filter((song): song is Song => song !== undefined);
    return songs.length > 0 && songs.every((song) => song.favorite);
  });

  /** The song pane B renders. Undefined on an empty library. */
  readonly currentSong = computed<Song | undefined>(() => {
    const id = this.session.currentSongId();
    return id === null
      ? undefined
      : this.store.entities().find((song) => song.id === id);
  });

  /**
   * The focused song, rendered (PRD-UI-SHELL.md §4).
   *
   * Parsed here rather than read from a cache: `Song.cache` holds the resolved
   * title and subtitle, not an AST — the AST is derived-and-discarded, and a song
   * is one page, so parsing it is sub-millisecond. This recomputes only when the
   * focused row or a setting actually changes.
   */
  private readonly plan = computed(() => {
    const song = this.currentSong();
    if (!song) {
      return undefined;
    }
    return this.renderer.layout(
      this.parser.parse(song.content),
      resolveSettings(this.settings.global(), undefined, song.settings),
    );
  });

  readonly svg = computed(() => {
    const plan = this.plan();
    return plan ? this.renderer.emit(plan) : '';
  });

  /** The paper's shape as width ÷ height — the song's own, so the frame is the
   * page it prints on. */
  readonly aspectRatio = computed(() => {
    const box = this.plan()?.box;
    return box && box.height > 0 ? box.width / box.height : 210 / 297;
  });

  /** The direction actually in force — a `dir`-less query resolves to a default,
   * and the explorer's arrow has to point the way the list is really sorted. */
  effectiveDir(sort: ExplorerSort, dir?: ExplorerSortDir): ExplorerSortDir {
    return dir ?? DEFAULT_SORT_DIR[sort];
  }

  /**
   * Bring the store's query in line with the URL — the URL is the source of truth
   * for search and sort (§7), so this runs on every param change and never the
   * other way round.
   *
   * Each setter resets the window and refetches, so only what actually changed is
   * called: pushing a `?q=` must not also re-fetch for a sort that did not move.
   */
  async syncQuery(params: {
    query: string;
    sort: ExplorerSort;
    dir?: ExplorerSortDir;
    isFavoritesFirst: boolean;
  }): Promise<void> {
    const isSortStale =
      params.sort !== this.store.sort() || params.dir !== this.store.dir();
    const isQueryStale = params.query !== this.store.query();
    const isFavoriteStale =
      params.isFavoritesFirst !== this.store.favoritesFirst();

    if (isSortStale) {
      await this.store.setSort(params.sort, params.dir);
    }
    if (isFavoriteStale) {
      await this.store.setFavoritesFirst(params.isFavoritesFirst);
    }
    if (isQueryStale) {
      await this.store.setSearch(params.query);
    }
    if (
      !isSortStale &&
      !isQueryStale &&
      !isFavoriteStale &&
      !this.store.loaded()
    ) {
      await this.store.load();
    }
  }

  /**
   * Select the most recently updated song on entering `/songs`, so the render
   * pane is useful immediately instead of greeting you with a blank page
   * (PRD-UI-SHELL.md §4). Never overrides a song the user already picked.
   */
  async autoSelect(): Promise<void> {
    if (this.session.currentSongId() !== null) {
      return;
    }
    const song = await this.store.lastChanged();
    if (song && this.session.currentSongId() === null) {
      this.session.setCurrentSong(song.id);
    }
  }

  loadMore(): void {
    void this.store.loadMore();
  }

  /** Push search/sort into the URL; `syncQuery` picks the change back up. */
  setQuery(query: string): void {
    this.navigate({ q: query || null });
  }

  /** `dir` rides in the URL only once the user has overridden the axis's natural
   * direction — `null` drops the param, so the default speaks again. */
  setSort(change: SortChange): void {
    this.navigate({ sort: change.key, dir: change.dir ?? null });
  }

  /** `?fav=1` rides in the URL like the sort, so a reload and a shared link
   * land on the list you were actually looking at (§7). */
  setFavoritesFirst(isFirst: boolean): void {
    this.navigate({ fav: isFirst ? '1' : null });
  }

  /**
   * A click on the row body: this song becomes the current one **and the whole
   * selection** (see `RowSelection`). Looking at a song and acting on it are the
   * same gesture everywhere else in the app; the checkbox is what builds a set.
   */
  activate(id: string): void {
    this.selection.selectOnly(id);
    this.session.setCurrentSong(id);
  }

  open(id: string): void {
    void this.router.navigate(['/songs', id, 'edit']);
  }

  toggleSelect(id: string): void {
    this.selection.toggle(id);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  async create(): Promise<void> {
    const song = this.newSong();
    await this.store.upsert(song);
    await this.store.refresh();
    this.session.setCurrentSong(song.id);
    this.open(song.id);
  }

  async rename(id: string, name: string): Promise<void> {
    await this.patch(id, { name });
  }

  async toggleFavorite(id: string): Promise<void> {
    const song = this.find(id);
    if (song) {
      await this.patch(id, { favorite: !song.favorite });
    }
  }

  /**
   * Bulk favorite: **one decision for the whole selection**, never a per-row flip.
   *
   * The rule is "favourite them all, unless they already all are — then clear
   * them all". A mixed selection therefore fills in the gaps rather than
   * inverting each row, which is the only reading where clicking the button twice
   * is not destructive: the first click makes them all favourites, the second
   * takes them all back off. A per-row toggle over a mixed selection leaves the
   * user worse off than before, because half of it flips the way they did not
   * mean.
   */
  async favoriteMany(ids: string[]): Promise<void> {
    const songs = ids
      .map((id) => this.find(id))
      .filter((song): song is Song => song !== undefined);
    if (songs.length === 0) {
      return;
    }
    const favorite = !songs.every((song) => song.favorite);
    for (const song of songs) {
      // Only the rows that actually change: an unchanged row would still take an
      // `updatedAt` bump and jump to the top of a "recently changed" sort.
      if (song.favorite !== favorite) {
        await this.write(song.id, { favorite });
      }
    }
    // One refresh for the batch, not one per row: each is a full re-query.
    await this.store.refresh();
  }

  /**
   * A copy is a new Song with a new id: same content and settings, its own
   * identity. Nothing points at it, and nothing that pointed at the original
   * follows (CONTEXT.md §Song).
   */
  async duplicate(id: string): Promise<void> {
    const song = this.find(id);
    if (!song) {
      return;
    }
    const now = Date.now();
    await this.store.upsert({
      ...song,
      id: crypto.randomUUID(),
      name: $localize`:@@songs.copyName:${song.name}:name: (copy)`,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await this.store.refresh();
  }

  /**
   * Ask to delete: gather what it would destroy, then let the user look at it.
   *
   * The songbooks are read **before** anything is written, and read per song, so
   * the warning names the actual slots at risk rather than a count
   * (CONTEXT.md §Delete vs Remove).
   */
  async requestDelete(ids: string[]): Promise<void> {
    const songs = ids
      .map((id) => this.find(id))
      .filter((song): song is Song => song !== undefined);
    if (songs.length === 0) {
      return;
    }

    const uses: SongUse[] = [];
    for (const song of songs) {
      const books = await this.songbooks.songbooksWith(song.id);
      for (const book of books) {
        uses.push({
          bookId: book.id,
          bookName: book.name,
          songId: song.id,
          songName: song.name,
        });
      }
    }

    this._pendingDelete.set({
      ids: songs.map((song) => song.id),
      names: songs.map((song) => song.name),
      uses,
    });
  }

  cancelDelete(): void {
    this._pendingDelete.set(null);
  }

  /**
   * Delete for real: tombstone each song and cascade it out of every songbook.
   *
   * **The cascade runs first.** Both halves are soft writes, so ordering cannot
   * corrupt anything — but if the second half fails, a song that still exists in
   * a songbook it was removed from is a recoverable mess, while a tombstoned song
   * that songbooks still reference is a dangling slot the songbook UI must then
   * defend against forever.
   */
  async confirmDelete(): Promise<void> {
    const pending = this._pendingDelete();
    if (!pending) {
      return;
    }
    this._pendingDelete.set(null);

    for (const id of pending.ids) {
      await this.songbooks.removeSongEverywhere(id);
      await this.store.remove(id);
      this.selection.deselect(id);
    }
    await this.store.refresh();

    // The current song may be the one that just went. Pane B must not keep
    // rendering a tombstone, so fall back to whatever is now most recent.
    const current = this.session.currentSongId();
    if (current !== null && pending.ids.includes(current)) {
      this.session.setCurrentSong(null);
      await this.autoSelect();
    }
  }

  /**
   * Open the songbook that uses this song, with the song selected — the link the
   * in-use warning offers (CONTEXT.md §Delete vs Remove). Selecting first means
   * the songbook opens already pointing at the song you were asking about.
   */
  openSongbook(use: SongUse): void {
    this.cancelDelete();
    this.session.setCurrentSong(use.songId);
    void this.router.navigate(['/songbooks', use.bookId]);
  }

  // --- Transfer (Epic 7) -----------------------------------------------
  //
  // Every act here answers **the selection, or the song you are looking at** —
  // the same rule the delete and favourite buttons follow. Nothing in the app
  // acts on "the whole library" from a button; that is Export's own screen
  // (Epic 12) and a deliberate second thought.

  /** What a bulk-bar transfer acts on: the ticked rows, else the focused one. */
  private readonly barIds = computed<string[]>(() => {
    const selected = [...this.selection.ids()];
    if (selected.length > 0) return selected;
    const current = this.session.currentSongId();
    return current === null ? [] : [current];
  });

  /**
   * One row's menu names **that row**, and only that row. Set while its download
   * dialog is open; null the rest of the time, which is when the bar's own
   * subject (selection-or-current) answers instead.
   */
  private readonly _rowTarget = signal<string | null>(null);

  /** The subject of a download in flight — a row if the menu opened it, else
   * the bar's. */
  readonly downloadIds = computed<string[]>(() => {
    const row = this._rowTarget();
    return row === null ? this.barIds() : [row];
  });

  /** Live for the bulk bar's Download button. */
  readonly hasBarTransfer = computed(() => this.barIds().length > 0);

  /** The bulk bar's Download: acts on the selection-or-current. */
  openDownload(): void {
    this._rowTarget.set(null);
    if (this.barIds().length > 0) this._isDownloadOpen.set(true);
  }

  /** A row's menu Download: acts on that one row. */
  openDownloadRow(id: string): void {
    this._rowTarget.set(id);
    this._isDownloadOpen.set(true);
  }

  cancelDownload(): void {
    this._isDownloadOpen.set(false);
    this._rowTarget.set(null);
  }

  /**
   * Render and save. One id takes the single-song formats, several take the
   * batch ones — the dialog offers only the set that matches the count, so the
   * two branches here can trust what they are given.
   */
  async download(format: DownloadFormat): Promise<void> {
    const ids = this.downloadIds();
    this._isDownloadOpen.set(false);
    this._rowTarget.set(null);
    if (ids.length === 0) return;
    await this.busy(async () => {
      if (ids.length === 1) {
        await this.downloads.downloadSong(ids[0], format as SongFormat);
      } else {
        await this.downloads.downloadSongs(ids, format as MultiFormat);
      }
    });
  }

  /** The bulk bar's Export: the selection-or-current, no dialog (nothing to
   * choose — Export has one format). */
  async exportSelection(): Promise<void> {
    await this.exportIds(this.barIds());
  }

  /** A row's menu Export: that one row. */
  async exportRow(id: string): Promise<void> {
    await this.exportIds([id]);
  }

  private async exportIds(songIds: readonly string[]): Promise<void> {
    if (songIds.length === 0) return;
    await this.busy(() => this.exporter.export({ songIds: [...songIds] }));
  }

  /**
   * Read a picked file and work out what it would do. Nothing is written until
   * `confirmImport`, which is the whole point of the two steps.
   */
  async readImport(file: File): Promise<void> {
    this._importError.set(null);
    try {
      const source = await this.importer.read(file);
      const plan = await this.importer.plan(source.snapshot);
      this.importPlan = plan;
      this._importPreview.set({
        songCount: plan.songs.length,
        songbookCount: plan.songbooks.length,
        conflicts: plan.conflicts.map((conflict) => ({ ...conflict })),
        hasUnknownSettings: source.status === 'warn',
      });
    } catch (error) {
      this.importPlan = null;
      this._importPreview.set(null);
      this._importError.set(
        (error as { reason?: ImportFailure }).reason === 'refused'
          ? 'refused'
          : 'unreadable',
      );
    }
  }

  cancelImport(): void {
    this.importPlan = null;
    this._importPreview.set(null);
    this._importError.set(null);
  }

  async confirmImport(choice: ImportChoice): Promise<void> {
    const plan = this.importPlan;
    this.cancelImport();
    if (!plan) return;
    await this.busy(async () => {
      await this.importer.apply(plan, choice);
      // The window is a query result, and the import just changed what that
      // query answers — several times over, at ids the window never held.
      await this.store.refresh();
    });
  }

  /** Run a long job with the screen saying so. */
  private async busy(job: () => Promise<unknown>): Promise<void> {
    this._isBusy.set(true);
    try {
      await job();
    } finally {
      this._isBusy.set(false);
    }
  }

  private find(id: string): Song | undefined {
    return this.store.entities().find((song) => song.id === id);
  }

  /**
   * Write a change and put the row back where the current query says it belongs.
   * Every field here is one the list sorts or searches on, so every write can
   * move a row — `refresh` is not an optimisation, it is what keeps the window
   * telling the truth.
   */
  private async patch(id: string, changes: Partial<Song>): Promise<void> {
    await this.write(id, changes);
    await this.store.refresh();
  }

  private async write(id: string, changes: Partial<Song>): Promise<void> {
    const song = this.find(id);
    if (song) {
      await this.store.upsert({ ...song, ...changes, updatedAt: Date.now() });
    }
  }

  private newSong(): Song {
    const now = Date.now();
    // The cache is derived from content, so seeded content has to seed it too —
    // otherwise the new row shows a blank title until the first keystroke
    // rewrites it (PRD-DOMAIN-MODEL §Song: derived, never authored).
    const ast = this.parser.parse(TUTORIAL_CONTENT);
    return {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      // CONTEXT.md calls Name "unique within the library, like a filename", but
      // nothing is keyed by it — songbooks and imports match on uuid precisely so
      // a rename can never break a link. Enforcing uniqueness here would mean
      // asking the repository for every name on every create, to protect an
      // invariant no code relies on. Left unenforced deliberately.
      name: NEW_SONG_NAME,
      content: TUTORIAL_CONTENT,
      favorite: false,
      settings: {},
      cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
    };
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      // Search and sort are a refinement of where you are, not somewhere you
      // went: Back should leave /songs, not replay every keystroke.
      replaceUrl: true,
    });
  }
}
