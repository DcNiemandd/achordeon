// Songbooks presenter — Epic 6 ▸ subtask 1
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §3 (the seam), §4 (single pane)

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DownloadService,
  ExportService,
  ImportService,
  SettingsStore,
  SongStore,
  SongbookStore,
  type SongbookPreview,
} from '@achordeon/shared/data-access';
import {
  ALL_SONGS_ID,
  resolveSongbookPrint,
  type ImportPlan,
  type Songbook,
  type SongbookPrint,
} from '@achordeon/shared/domain';
import type { SongRow } from '../shared/song-explorer';
import {
  DATA_FORMAT,
  PrintOptionsStore,
  composeSongbookChoice,
  toDevicePrintOptions,
  type DownloadProgress,
  type ImportChoice,
  type ImportFailure,
  type ImportPreview,
  type SongbookPdfChoice,
} from '../shared/transfer';

/** The name a songbook is born with, before the user has said what it is. */
const NEW_SONGBOOK_NAME = $localize`:@@songbooks.newName:New songbook`;

/** The virtual songbook's display name — it has no record to carry one. */
const ALL_SONGS_NAME = $localize`:@@songbooks.allSongs:All songs`;

/**
 * What that row actually is. It looks like a songbook you made and is not one,
 * which is the sort of thing a list should say out loud rather than leave you
 * to discover by finding its buttons missing.
 */
const ALL_SONGS_HINT = $localize`:@@songbooks.allSongs.help:Every song in your library, always up to date. You cannot reorder it or remove songs from it. Choose the order it is performed in on the Stage.`;

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
  private readonly settings = inject(SettingsStore);
  private readonly print = inject(PrintOptionsStore);

  /**
   * What the download dialog opens on: the device's last-used paper (#3) composed
   * with the picked book's own print structure. The dialog no longer edits that
   * structure — it belongs to the book (set in its settings) — but the download
   * still draws the book with it, so it rides in here to reach the renderer.
   */
  readonly downloadInitial = computed<SongbookPdfChoice>(() =>
    composeSongbookChoice(
      this.print.options(),
      this.printFor(this._downloadId()),
    ),
  );

  /**
   * The print structure for a book id: a real book's own (on its record), or —
   * for the record-less All songs — the device-local slot its settings dialog
   * writes. `undefined` id and unknown books resolve to the defaults.
   */
  private printFor(id: string | null) {
    if (!id) return undefined;
    return id === ALL_SONGS_ID
      ? this.print.allSongsPrint()
      : this.find(id)?.print;
  }

  private readonly exporter = inject(ExportService);
  private readonly importer = inject(ImportService);
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
      // An empty library has nothing to perform, so the row's Perform disappears
      // — the same answer the stage picker gives an empty book.
      isEmpty: this._librarySize() === 0,
      hint: ALL_SONGS_HINT,
    },
    ...this.store.live().map((book, index) => ({
      id: book.id,
      position: index + 1,
      name: book.name,
      title: this.countLabel(book.entries.length),
      subtitle: '',
      isFavorite: false,
      isEmpty: book.entries.length === 0,
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
   * The picked book, **rendered as its whole print preview** — every page the PDF
   * would hold, WYSIWYG (`DownloadService.previewSongbook`, which reuses the same
   * assembly, so the pane and the file cannot disagree). It used to be only the
   * title page; now you can read the book before you print it.
   *
   * All songs previews too, generated the same way it downloads — the library, in
   * its print order.
   */
  private readonly _preview = signal<SongbookPreview | null>(null);
  readonly preview = this._preview.asReadonly();

  /** Bumped per request so a slow render of a book you have already clicked past
   * cannot land in the pane after the book you are now looking at. */
  private previewToken = 0;

  constructor() {
    // Re-render the pane when the picked book changes, when its own print
    // structure is edited (it is read below, so this effect tracks it), or when
    // the device paper changes. Off the render pipeline, so it is async; the
    // token guards against a stale render winning a race.
    effect(() => {
      const id = this._currentId();
      const device = this.print.options();
      // `printFor` reads the book's record (a real book) or the All songs device
      // slot, so an edit to either — and the library size behind All songs —
      // reflows the preview.
      const print = this.printFor(id);
      this._librarySize();

      if (!id) {
        this._preview.set(null);
        return;
      }
      const { format, ...opts } = composeSongbookChoice(device, print);
      void format; // the preview renders every format the same; it is not paper
      const token = ++this.previewToken;
      void this.downloads.previewSongbook(id, opts).then((preview) => {
        if (token === this.previewToken) this._preview.set(preview);
      });
    });
  }

  select(id: string): void {
    this._currentId.set(id);
  }

  async load(): Promise<void> {
    if (!this.store.loaded()) {
      await this.store.load();
    }
    this._librarySize.set((await this.songs.allLive()).length);
  }

  /**
   * Grow the window as the list nears its end — the same infinite scroll the
   * Songs module has.
   *
   * `SongbookStore` has always been paged, but nothing ever asked it for the
   * second page: this list mounted the explorer without binding `loadMore`, so
   * the window stayed at whatever the first read returned and a library of more
   * than `PAGE_LIMIT` books simply ended. A cap you cannot see is worse than a
   * pager you can — nothing said the list was truncated, so the missing books
   * read as books that were never saved.
   */
  loadMore(): void {
    void this.store.loadMore();
  }

  open(id: string): void {
    void this.router.navigate(['/songbooks', id]);
  }

  /**
   * Take this songbook to the stage — Epic 8's "Perform shortcut from
   * Songbooks", and the reason you do not have to go to the Stage module and find
   * the book again in a second list. Straight to `/stage/:id`, which is the same
   * navigation the picker makes; `StageSession.start` decides whether that is a
   * new performance or a resumed one.
   */
  perform(id: string): void {
    void this.router.navigate(['/stage', id]);
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
   * A copy of a songbook: a new record with its own id, the same order,
   * settings and title-page fields (#12). It carries the **same slots** — a
   * songbook holds references, so duplicating one is free and the songs it
   * points at are untouched. The virtual All songs is read-only and never
   * reaches here (its row has no duplicate action).
   */
  async duplicate(id: string): Promise<void> {
    const book = this.find(id);
    if (!book) return;
    const now = Date.now();
    await this.store.upsert({
      ...book,
      id: crypto.randomUUID(),
      name: $localize`:@@songbooks.copyName:${book.name}:name: (copy)`,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      // A fresh array, not a shared reference — the copy's order is its own.
      entries: [...book.entries],
    });
    await this.store.refresh();
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

  // --- Settings (Epic 6) -----------------------------------------------
  //
  // The book's own scope of the render cascade (chord colour, size) and its
  // title-page fields, in a dialog opened from the row's ⋯ — the very panel the
  // builder mounts, on a book you have not opened. The virtual All songs has no
  // record, and so nothing to configure; its row carries no settings action.

  /** The book whose settings dialog is open, or null. */
  private readonly _settingsId = signal<string | null>(null);
  readonly isSettingsOpen = computed(() => this._settingsId() !== null);

  /**
   * The settings dialog is open on the virtual **All songs**. It has no record —
   * so no title-page fields and no render-cascade scope, only a print structure
   * (kept device-local) — and the dialog shows just that.
   */
  readonly isSettingsAllSongs = computed(
    () => this._settingsId() === ALL_SONGS_ID,
  );

  /**
   * The book the dialog is bound to, read **live from the window** so an edit
   * written below flows straight back into the open dialog rather than through a
   * snapshot that would go stale the moment it is saved. `undefined` for All
   * songs, which has no record.
   */
  private readonly settingsBook = computed(() => {
    const id = this._settingsId();
    return id === null ? undefined : this.find(id);
  });

  readonly settingsName = computed(() => this.settingsBook()?.name ?? '');

  /** Title-page fields — authored via GUI, never parsed (ADR-0001). */
  readonly titleFields = computed(() => ({
    title: this.settingsBook()?.title ?? '',
    subtitle: this.settingsBook()?.subtitle ?? '',
    author: this.settingsBook()?.author ?? '',
  }));

  /** This scope's sparse overrides (ADR-0006), for the settings panel. */
  readonly songbookSettings = computed(
    () => (this.settingsBook()?.settings ?? {}) as Record<string, unknown>,
  );

  /**
   * The print structure the settings dialog edits, defaults filled in. A real
   * book's own (on its record); the device-local slot for All songs. Setting a
   * summary here reflows the preview, since its effect reads the same source.
   */
  readonly songbookPrint = computed(() =>
    this.isSettingsAllSongs()
      ? this.print.allSongsPrint()
      : resolveSongbookPrint(this.settingsBook()?.print),
  );

  /** Write the print structure from the settings dialog — to the record for a
   * real book, to the device-local slot for All songs. */
  async setPrint(print: SongbookPrint): Promise<void> {
    if (this.isSettingsAllSongs()) {
      this.print.saveAllSongsPrint(print);
      return;
    }
    await this.patchSettingsBook({ print });
  }

  /**
   * What the songbook scope inherits: the Global defaults, the only thing below
   * it in the cascade (ADR-0006). The panel needs them for the "inherited" badge
   * and as the value it draws while nothing is overridden.
   */
  readonly inheritedSettings = computed(
    () => this.settings.global() as Record<string, unknown>,
  );

  /** Open the settings dialog on a real book, or on **All songs** — which has no
   * record but does have a print structure to configure (device-local). */
  openSettings(id: string): void {
    if (id === ALL_SONGS_ID || this.find(id)) {
      this._settingsId.set(id);
    }
  }

  closeSettings(): void {
    this._settingsId.set(null);
  }

  async setTitleField(
    field: 'title' | 'subtitle' | 'author',
    value: string,
  ): Promise<void> {
    await this.patchSettingsBook({ [field]: value });
  }

  /**
   * A sparse patch from the settings panel — the songbook theme that re-styles
   * every song performed in this book (CONTEXT.md §Render settings). `undefined`
   * for a key resets it to inherited, which at this scope is a **deletion**, not
   * a write of the global value: overrides are stored sparse so the cascade can
   * keep resolving through them (ADR-0006).
   */
  async patchSettings(patch: Record<string, unknown>): Promise<void> {
    const book = this.settingsBook();
    if (!book) {
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
    await this.patchSettingsBook({
      settings: settings as Songbook['settings'],
    });
  }

  private async patchSettingsBook(changes: Partial<Songbook>): Promise<void> {
    const book = this.settingsBook();
    if (!book) {
      return;
    }
    await this.store.upsert({ ...book, ...changes, updatedAt: Date.now() });
    await this.store.refresh();
  }

  // --- Transfer (Epic 7) -----------------------------------------------
  //
  // Download lives on the **row's own menu** (Epic 7 follow-up), with the other
  // row actions, so acting on a songbook is one gesture from the list rather
  // than "select, then reach for the toolbar". Export is not a second item
  // beside it any more — it is a format inside its dialog. The act names the
  // row it came from — never `currentId`, which is what pane B is previewing
  // and may be a different book entirely.

  /** The book whose download dialog is open, or null. */
  private readonly _downloadId = signal<string | null>(null);
  private readonly _isBusy = signal(false);
  private readonly _progress = signal<DownloadProgress | null>(null);
  readonly isDownloadOpen = computed(() => this._downloadId() !== null);
  readonly isBusy = this._isBusy.asReadonly();
  /** How far a running download has generated — the dialog's spinner and count. */
  readonly downloadProgress = this._progress.asReadonly();

  /** The name in the open dialog's title. */
  readonly downloadName = computed(() => {
    const id = this._downloadId();
    if (id === ALL_SONGS_ID) return ALL_SONGS_NAME;
    return (id === null ? undefined : this.find(id)?.name) ?? '';
  });

  /** The download open on the virtual book — the one that gets the song-order
   * controls, because it is the only book with no order of its own. */
  readonly isDownloadAllSongs = computed(
    () => this._downloadId() === ALL_SONGS_ID,
  );

  /**
   * Downloadable / exportable: a real songbook, **and** the virtual All songs.
   *
   * All songs has no record, but it is the whole library — a PDF of every song
   * or an export of the lot is exactly what a person wants from it, and the
   * services below synthesise the book for the virtual id. What it still cannot
   * do is rename, duplicate or delete, which is the read-only row's business.
   */
  private isTransferable(id: string): boolean {
    return id === ALL_SONGS_ID || this.find(id) !== undefined;
  }

  openDownloadRow(id: string): void {
    if (this.isTransferable(id)) this._downloadId.set(id);
  }

  /** Ignored mid-render — the dialog hosts the progress until the file is done. */
  cancelDownload(): void {
    if (this._isBusy()) return;
    this._downloadId.set(null);
    this._progress.set(null);
  }

  /**
   * Whichever shape the dialog was left on — a render, or (the `json` branch,
   * which is what the row's Export item became) the whole book as an Achordeon
   * file **with its songs**, which `ExportService` adds: a book of references
   * imports as a book of nothing without them.
   */
  async download(choice: SongbookPdfChoice): Promise<void> {
    const id = this._downloadId();
    if (!id || !this.isTransferable(id)) {
      this.cancelDownload();
      return;
    }
    const { format } = choice;
    if (format === DATA_FORMAT) {
      // Not saved to the print options — see the detail presenter: taking the
      // data file once is not a statement about paper.
      await this.busy(() => this.exporter.export({ songbookIds: [id] }));
      this._downloadId.set(null);
      return;
    }
    // Only the paper is remembered here (#3). The book's structure is not the
    // download dialog's to set any more — it belongs to the book, set in its
    // settings — so a download writes nothing to the record.
    this.print.save(toDevicePrintOptions(choice));
    // The dialog stays open through the render for the spinner and count, then
    // closes when the file is saved.
    await this.busy(() =>
      this.downloads.downloadSongbook(
        id,
        { ...choice, format },
        (done, total) => this._progress.set({ done, total }),
      ),
    );
    this._progress.set(null);
    this._downloadId.set(null);
  }

  // --- Import (Epic 7) --------------------------------------------------
  //
  // The same import a file offers the Songs module — a file holds songs and
  // songbooks alike, so importing from here is no different, and either module
  // should be able to start it. The UI is the shared `ImportPanel`; the flow is
  // here, because it touches the stores.

  private readonly _importPreview = signal<ImportPreview | null>(null);
  private readonly _importError = signal<ImportFailure | null>(null);
  /** The plan behind the preview — held for the confirm, out of the view model. */
  private importPlan: ImportPlan | null = null;
  readonly importPreview = this._importPreview.asReadonly();
  readonly importError = this._importError.asReadonly();

  /** Read a picked file and work out what it would do. Nothing is written until
   * `confirmImport`, which is the whole point of the two steps. */
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
      // Both stores: a file brings songs and songbooks, and this list is the
      // songbooks, but the library size the All songs row shows comes from the
      // song store — refresh both, then re-read the count.
      await this.store.refresh();
      await this.songs.refresh();
      this._librarySize.set((await this.songs.allLive()).length);
    });
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
