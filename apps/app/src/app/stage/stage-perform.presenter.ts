// Stage perform presenter — Epic 8 ▸ performing mode
// Spec: docs/achordeon-implementation.md §Epic 8

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ParserService,
  RenderService,
  SettingsStore,
  SongStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import { SONG_REPOSITORY } from '@achordeon/shared/data-access';
import {
  ALL_SONGS_ID,
  isAllSongs,
  resolveSettings,
  type Song,
  type Songbook,
} from '@achordeon/shared/domain';
import { StageSession } from '../shared/layout';

const A4_RATIO = 210 / 297;

/** Minimal fake-book record for the virtual "All songs" case. */
const ALL_SONGS_BOOK: Songbook = {
  id: ALL_SONGS_ID,
  name: $localize`:@@songbooks.allSongs:All songs`,
  title: '',
  subtitle: '',
  author: '',
  entries: [],
  settings: {},
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
};

export interface StageSummaryRow {
  readonly index: number;
  readonly name: string;
  readonly title: string;
}

/**
 * The **render-derived** half of a performance: the songs of the current book
 * and the SVG for the song at `StageSession.index()`.
 *
 * Route-scoped (the page provides it) and store-dependent, which is why it
 * lives here and not in `shared/layout`: `shared/**` may not inject a store
 * (the presenter rule, PRD-UI-SHELL.md §3). The *persistent* half — which book,
 * which index, the lobby — lives in `StageSession`, so a jump to another module
 * and back rehydrates the render at the song the performer left on.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3).
 *
 * For the virtual All songs book, `booksStore.byId` returns undefined — so the
 * presenter detects `isAllSongs(id)` and calls `songsStore.allLive()` instead.
 */
@Injectable()
export class StagePerformPresenter {
  private readonly booksStore = inject(SongbookStore);
  private readonly songsStore = inject(SongStore);
  private readonly songRepo = inject(SONG_REPOSITORY);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);
  private readonly session = inject(StageSession);

  private readonly _book = signal<Songbook | null>(null);
  private readonly _songs = signal<Song[]>([]);
  private readonly _summaryQuery = signal('');

  readonly name = computed(() => this._book()?.name ?? '');

  /** True once loaded and the book is truly empty. A missing book bounces to /stage. */
  readonly isEmpty = computed(() => this._songs().length === 0);

  readonly summaryQuery = this._summaryQuery.asReadonly();

  private readonly _currentSong = computed(
    () => this._songs()[this.session.index()] ?? null,
  );

  /**
   * The render plan for the current song, with all settings cascaded.
   *
   * A computed rather than a method: the plan re-runs whenever the index,
   * book settings, song settings or global settings change — all via signals,
   * so nothing needs to be wired explicitly.
   */
  private readonly _plan = computed(() => {
    const song = this._currentSong();
    if (!song) return null;
    const ast = this.parser.parse(song.content);
    const resolved = resolveSettings(
      this.settings.global(),
      this._book()?.settings,
      song.settings,
    );
    return this.renderer.layout(ast, resolved);
  });

  /** Self-contained SVG string for <app-song-render>. */
  readonly svg = computed(() => {
    const plan = this._plan();
    return plan ? this.renderer.emit(plan) : '';
  });

  /** Width ÷ height, for the <app-blank-page> frame. */
  readonly pageRatio = computed(() => {
    const box = this._plan()?.box;
    return box && box.height > 0 ? box.width / box.height : A4_RATIO;
  });

  readonly summaryRows = computed<StageSummaryRow[]>(() => {
    const q = this._summaryQuery().toLowerCase();
    return this._songs()
      .map((song, i) => ({
        index: i,
        name: song.name,
        title: song.cache.title,
      }))
      .filter(
        (row) =>
          !q ||
          row.name.toLowerCase().includes(q) ||
          row.title.toLowerCase().includes(q),
      );
  });

  /**
   * Load the songbook and hydrate its entry songs.
   *
   * `session.start(id)` decides the index (kept on the same book, reset on a new
   * one); this always reloads the songs, because a fresh presenter instance
   * after a route re-entry has none — that reload at the preserved index is what
   * makes the performance resume.
   *
   * For the virtual All songs book (`isAllSongs(id)` is true), the store has no
   * record, so we bypass the store and use `songsStore.allLive()` directly. That
   * returns all live songs in name order, which is the logical definition of
   * "All songs".
   *
   * For real books, a missing or tombstoned book bounces back to /stage rather
   * than showing a broken view. Songs that were deleted are skipped: a deleted
   * song was removed from the library, not from this performance, so the list
   * just becomes shorter.
   */
  async open(id: string): Promise<void> {
    this.session.start(id);

    if (isAllSongs(id)) {
      this._book.set(ALL_SONGS_BOOK);
      const songs = await this.songsStore.allLive({ sort: 'name' });
      this._songs.set(songs);
      this.session.setTotal(songs.length);
      return;
    }

    const book = await this.booksStore.byId(id);
    if (!book || book.deletedAt !== null) {
      void this.router.navigate(['/stage']);
      return;
    }
    this._book.set(book);

    const songs: Song[] = [];
    for (const songId of book.entries) {
      const song = await this.songRepo.get(songId);
      if (song && song.deletedAt === null) {
        songs.push(song);
      }
    }
    this._songs.set(songs);
    this.session.setTotal(songs.length);
  }

  setSummaryQuery(q: string): void {
    this._summaryQuery.set(q);
  }
}
