// Songs presenter — Epic 5 ▸ subtasks 1–2
// Spec: PRD-UI-SHELL.md §3 (the seam), §7 (state placement); CONTEXT.md §Song explorer

import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_SORT_DIR,
  ParserService,
  RenderService,
  SessionStore,
  SettingsStore,
  SongStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import { resolveSettings, type Song } from '@achordeon/shared/domain';
import type {
  ExplorerSort,
  ExplorerSortDir,
  SongRow,
  SortChange,
} from '../shared/song-explorer';
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly _pendingDelete = signal<PendingDelete | null>(null);

  /** The delete awaiting confirmation, or null. Session-only and the feature's,
   * like any transient dialog state (PRD-UI-SHELL.md §7). */
  readonly pendingDelete = this._pendingDelete.asReadonly();

  readonly rows = computed<SongRow[]>(() =>
    this.store.live().map((song) => ({
      id: song.id,
      name: song.name,
      // The parser cache, not a re-parse: it is stored derived state precisely so
      // that listing 500 songs costs no parsing (PRD-DOMAIN-MODEL §Song).
      title: song.cache.title,
      subtitle: song.cache.subtitle,
      isFavorite: song.favorite,
    })),
  );

  readonly selectedIds = this.session.selectedIds;
  readonly currentId = this.session.currentSongId;
  readonly isLoaded = this.store.loaded;

  /** What the bulk star would do — so the button can say so before it is pressed. */
  readonly isSelectionAllFavorite = computed(() => {
    const songs = [...this.session.selectedIds()]
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
  }): Promise<void> {
    const isSortStale =
      params.sort !== this.store.sort() || params.dir !== this.store.dir();
    const isQueryStale = params.query !== this.store.query();

    if (isSortStale) {
      await this.store.setSort(params.sort, params.dir);
    }
    if (isQueryStale) {
      await this.store.setSearch(params.query);
    }
    if (!isSortStale && !isQueryStale && !this.store.loaded()) {
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

  activate(id: string): void {
    this.session.setCurrentSong(id);
  }

  open(id: string): void {
    void this.router.navigate(['/songs', id, 'edit']);
  }

  toggleSelect(id: string): void {
    this.session.toggle(id);
  }

  clearSelection(): void {
    this.session.clearSelection();
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
      this.session.deselect(id);
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
