// Songbooks presenter — Epic 6 ▸ subtask 1
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §3 (the seam), §4 (single pane)

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DownloadService,
  ExportService,
  RenderService,
  SettingsStore,
  SongStore,
  SongbookStore,
} from '@achordeon/shared/data-access';
import {
  ALL_SONGS_ID,
  resolveSettings,
  titlePageAst,
  type Songbook,
} from '@achordeon/shared/domain';
import type { SongRow } from '../shared/song-explorer';
import { PrintOptionsStore, type SongbookPdfChoice } from '../shared/transfer';

/** The name a songbook is born with, before the user has said what it is. */
const NEW_SONGBOOK_NAME = $localize`:@@songbooks.newName:New songbook`;

/** The virtual songbook's display name — it has no record to carry one. */
const ALL_SONGS_NAME = $localize`:@@songbooks.allSongs:All songs`;

/**
 * What that row actually is. It looks like a songbook you made and is not one,
 * which is the sort of thing a list should say out loud rather than leave you
 * to discover by finding its buttons missing.
 */
const ALL_SONGS_HINT = $localize`:@@songbooks.allSongs.help:Every song in your library, always up to date. You cannot reorder it or remove songs from it — but you can choose how it is sorted.`;

/** A songbook delete the user has asked for and not yet confirmed. */
export interface PendingSongbookDelete {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/**
 * The only thing in `songbooks/` that knows the business layer exists.
 *
 * Signals in, commands out (PRD-UI-SHELL.md §3). It owns the **view model**: the
 * list below has never seen a `Songbook`, which is what lets the virtual **All
 * songs** row sit in it as an equal without a record existing anywhere.
 */
@Injectable()
export class SongbooksPresenter {
  private readonly store = inject(SongbookStore);
  private readonly songs = inject(SongStore);
  private readonly downloads = inject(DownloadService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly print = inject(PrintOptionsStore);

  /** The last-used print options, for the download dialog to open on (#3). */
  readonly printOptions = this.print.options;
  private readonly exporter = inject(ExportService);
  private readonly router = inject(Router);

  /**
   * How many songs the library holds — the virtual row's count.
   *
   * Asked of the repository rather than counted off `SongStore.live()`: that is a
   * windowed cache of one page, so a library of 500 would have advertised "50".
   */
  private readonly _librarySize = signal(0);

  private readonly _pendingDelete = signal<PendingSongbookDelete | null>(null);
  readonly pendingDelete = this._pendingDelete.asReadonly();

  readonly isLoaded = this.store.loaded;

  /**
   * The list, in the **same row shape the song lists use** — it is the same
   * component (PRD-UI-SHELL.md §3), so a songbook row answers a click exactly
   * as a song row does. `title` carries the count, which is what a songbook has
   * to say about itself in a list.
   */
  readonly rows = computed<SongRow[]>(() => [
    // Always present, always first: it is the library itself, and a list of
    // custom books that does not offer the whole library is missing its default.
    {
      id: ALL_SONGS_ID,
      position: 0,
      name: ALL_SONGS_NAME,
      title: this.countLabel(this._librarySize()),
      subtitle: '',
      isFavorite: false,
      // No record behind it: nothing to rename, nothing to delete.
      isReadOnly: true,
      hint: ALL_SONGS_HINT,
    },
    ...this.store.live().map((book, index) => ({
      id: book.id,
      position: index + 1,
      name: book.name,
      title: this.countLabel(book.entries.length),
      subtitle: '',
      isFavorite: false,
    })),
  ]);

  private countLabel(count: number): string {
    return $localize`:@@songbooks.count:${count}:count: songs`;
  }

  /**
   * The songbook pane B is previewing — the Songs module's shape of screen, and
   * so its behaviour: **a click selects and previews, a double click opens**.
   * Selecting is not opening; you look before you go in.
   */
  private readonly _currentId = signal<string | null>(null);
  readonly currentId = this._currentId.asReadonly();

  /**
   * The picked book's title page, **rendered** — the same page the PDF prints
   * (Epic 7 ▸ subtask 6), not a second stack of styled text that would have to
   * be kept in step with it. `titlePageAst` is the one definition of what a
   * title page is made of; this and `DownloadService` both draw from it.
   *
   * **All songs gets one too**, generated. It has no record to carry authored
   * fields, but it is not nothing either — it is the library, and a blank sheet
   * where every other book shows its title page reads as a bug. So it prints its
   * name and what it holds. No author, because nobody wrote it.
   */
  private readonly titlePlan = computed(() => {
    const id = this._currentId();
    if (id === null) return undefined;
    const book = this.find(id) ?? (id === ALL_SONGS_ID ? this.virtual() : null);
    if (!book) return undefined;
    return this.renderer.layout(
      titlePageAst(book),
      resolveSettings(this.settings.global(), book.settings),
      // Centred, like the printed page — this preview IS that page (§4.5 hugs
      // the corner for songs, which a title page is not).
      { align: 'center' },
    );
  });

  /** The virtual book as a record, for the one thing that needs it to be one. */
  private virtual(): Songbook {
    return {
      id: ALL_SONGS_ID,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      name: ALL_SONGS_NAME,
      title: ALL_SONGS_NAME,
      subtitle: this.countLabel(this._librarySize()),
      author: '',
      settings: {},
      entries: [],
    };
  }

  readonly titlePageSvg = computed(() => {
    const plan = this.titlePlan();
    return plan ? this.renderer.emit(plan) : '';
  });

  /** The paper's shape, so the preview frame is the page it prints on. */
  readonly titlePageRatio = computed(() => {
    const box = this.titlePlan()?.box;
    return box && box.height > 0 ? box.width / box.height : 210 / 297;
  });

  select(id: string): void {
    this._currentId.set(id);
  }

  async load(): Promise<void> {
    if (!this.store.loaded()) {
      await this.store.load();
    }
    this._librarySize.set((await this.songs.allLive()).length);
  }

  open(id: string): void {
    void this.router.navigate(['/songbooks', id]);
  }

  /** A new songbook is empty and opens straight away — you made it to fill it. */
  async create(): Promise<void> {
    const now = Date.now();
    const book: Songbook = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: NEW_SONGBOOK_NAME,
      title: '',
      subtitle: '',
      author: '',
      settings: {},
      entries: [],
    };
    await this.store.upsert(book);
    await this.store.refresh();
    this._currentId.set(book.id);
    this.open(book.id);
  }

  async rename(id: string, name: string): Promise<void> {
    const book = this.find(id);
    if (book) {
      await this.store.upsert({ ...book, name, updatedAt: Date.now() });
      await this.store.refresh();
    }
  }

  /**
   * Ask to delete. A songbook delete destroys **no songs** — every entry is a
   * reference — so the confirmation says how many slots go, not what is at risk.
   */
  requestDelete(id: string): void {
    const book = this.find(id);
    if (book) {
      this._pendingDelete.set({
        id: book.id,
        name: book.name,
        count: book.entries.length,
      });
    }
  }

  cancelDelete(): void {
    this._pendingDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const pending = this._pendingDelete();
    if (!pending) {
      return;
    }
    this._pendingDelete.set(null);
    await this.store.remove(pending.id);
    await this.store.refresh();
    if (this._currentId() === pending.id) {
      this._currentId.set(null);
    }
  }

  // --- Transfer (Epic 7) -----------------------------------------------
  //
  // Download and Export live on the **row's own menu** (Epic 7 follow-up), with
  // the other row actions, so acting on a songbook is one gesture from the list
  // rather than "select, then reach for the toolbar". Each act names the row it
  // came from — never `currentId`, which is what pane B is previewing and may be
  // a different book entirely.

  /** The book whose download dialog is open, or null. */
  private readonly _downloadId = signal<string | null>(null);
  private readonly _isBusy = signal(false);
  readonly isDownloadOpen = computed(() => this._downloadId() !== null);
  readonly isBusy = this._isBusy.asReadonly();

  /** The name in the open dialog's title. */
  readonly downloadName = computed(() => {
    const id = this._downloadId();
    return (id === null ? undefined : this.find(id)?.name) ?? '';
  });

  /**
   * A real songbook can be downloaded; **the virtual All songs cannot**. It has
   * no record — no title page, no author, no order of its own — which are the
   * three things a songbook PDF is made of. The row menu is off for it entirely
   * (`SONGBOOK_LIST_CAPABILITIES` gives it no menu once its read-only row drops
   * duplicate and delete), so this only guards the stray call.
   */
  private isTransferable(id: string): boolean {
    return id !== ALL_SONGS_ID && this.find(id) !== undefined;
  }

  openDownloadRow(id: string): void {
    if (this.isTransferable(id)) this._downloadId.set(id);
  }

  cancelDownload(): void {
    this._downloadId.set(null);
  }

  async download(choice: SongbookPdfChoice): Promise<void> {
    const id = this._downloadId();
    this._downloadId.set(null);
    if (!id || !this.isTransferable(id)) return;
    this.print.save(choice); // remember it for next time (#3)
    await this.busy(() => this.downloads.downloadSongbook(id, choice));
  }

  /** The whole book as JSON — **with its songs**, which `ExportService` adds:
   * a book of references imports as a book of nothing without them. */
  async exportRow(id: string): Promise<void> {
    if (!this.isTransferable(id)) return;
    await this.busy(() => this.exporter.export({ songbookIds: [id] }));
  }

  private async busy(job: () => Promise<unknown>): Promise<void> {
    this._isBusy.set(true);
    try {
      await job();
    } finally {
      this._isBusy.set(false);
    }
  }

  private find(id: string): Songbook | undefined {
    return this.store.entities().find((book) => book.id === id);
  }
}
