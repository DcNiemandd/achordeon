// Stage perform presenter — Epic 8 ▸ performing mode
// Spec: docs/achordeon-implementation.md §Epic 8

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ParserService,
  RenderService,
  SettingsStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import { SONG_REPOSITORY } from '@achordeon/shared/data-access';
import {
  resolveSettings,
  type Song,
  type Songbook,
} from '@achordeon/shared/domain';

const A4_RATIO = 210 / 297;

export interface StageSummaryRow {
  readonly index: number;
  readonly name: string;
  readonly title: string;
}

/**
 * Performing-mode state for one songbook.
 *
 * Loads the songbook + its songs from the repository, tracks the current
 * index, renders the current song to SVG, and provides navigation commands.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3).
 */
@Injectable()
export class StagePerformPresenter {
  private readonly booksStore = inject(SongbookStore);
  private readonly songRepo = inject(SONG_REPOSITORY);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);

  private readonly _book = signal<Songbook | null>(null);
  private readonly _songs = signal<Song[]>([]);
  private readonly _index = signal(0);

  private readonly _isSummaryOpen = signal(false);
  private readonly _summaryQuery = signal('');

  readonly name = computed(() => this._book()?.name ?? '');
  readonly total = computed(() => this._songs().length);
  readonly index = this._index.asReadonly();
  /** 1-based display position. */
  readonly position = computed(() =>
    this._songs().length > 0 ? this._index() + 1 : 0,
  );

  readonly hasPrev = computed(() => this._index() > 0);
  readonly hasNext = computed(() => this._index() < this._songs().length - 1);

  /** True once loaded and the book is truly empty. A missing book bounces to /stage. */
  readonly isEmpty = computed(() => this._songs().length === 0);

  readonly isSummaryOpen = this._isSummaryOpen.asReadonly();
  readonly summaryQuery = this._summaryQuery.asReadonly();

  private readonly _currentSong = computed(
    () => this._songs()[this._index()] ?? null,
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
   * A missing or tombstoned book bounces back to /stage rather than showing a
   * broken view.
   *
   * Songs are loaded in entry order, and tombstoned entries are skipped rather
   * than making the list sparse: a deleted song was removed from the library,
   * not from this performance.
   */
  async load(id: string): Promise<void> {
    const book = await this.booksStore.byId(id);
    if (!book || book.deletedAt !== null) {
      void this.router.navigate(['/stage']);
      return;
    }
    this._book.set(book);
    this._index.set(0);

    const songs: Song[] = [];
    for (const songId of book.entries) {
      const song = await this.songRepo.get(songId);
      if (song && song.deletedAt === null) {
        songs.push(song);
      }
    }
    this._songs.set(songs);
  }

  prev(): void {
    this._index.update((i) => Math.max(0, i - 1));
  }

  next(): void {
    this._index.update((i) => Math.min(this._songs().length - 1, i + 1));
  }

  jumpTo(index: number): void {
    this._index.set(Math.max(0, Math.min(this._songs().length - 1, index)));
    this._isSummaryOpen.set(false);
  }

  openSummary(): void {
    this._isSummaryOpen.set(true);
    this._summaryQuery.set('');
  }

  closeSummary(): void {
    this._isSummaryOpen.set(false);
  }

  setSummaryQuery(q: string): void {
    this._summaryQuery.set(q);
  }
}
