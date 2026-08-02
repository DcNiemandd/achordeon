// Song editor presenter — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §3; ADR-0010; docs/PARSER-GRAMMAR.md §Reparse

import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  DownloadService,
  ExportService,
  ParserService,
  RenderService,
  SessionStore,
  SettingsStore,
  SongStore,
  SyncService,
  type SongFormat,
} from '@achordeon/shared/data-access';
import { DATA_FORMAT, type DownloadChoice } from '../shared/transfer';
import {
  ChordTheory,
  resolveSettings,
  transposeContent,
  type ChordNotation,
  type Song,
  type SongAst,
} from '@achordeon/shared/domain';
import { toMarkers } from './editor/warning-copy';

/**
 * Keystroke → IndexedDB. Short on purpose: the only thing the delay buys is not
 * writing once per keystroke. It is not a grace period — there is no Save button
 * and never will be (PRD-INFRASTRUCTURE.md §5: "local save = A, aggressive.
 * Local work is never lost").
 */
const SAVE_DEBOUNCE_MS = 400;

/**
 * The editor's half of the seam: it owns the song being edited, the content the
 * editor is showing, and the single AST that the markers and (subtask 6) the
 * preview both read.
 *
 * **One reparse feeds both consumers** (PARSER-GRAMMAR §Reparse). Parsing once
 * per settled edit and fanning the result out is not an optimisation — two parses
 * could disagree, and then the underline and the render would be describing
 * different songs.
 */
@Injectable()
export class SongEditorPresenter {
  private readonly songs = inject(SongStore);
  private readonly session = inject(SessionStore);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly theory = inject(ChordTheory);
  private readonly downloads = inject(DownloadService);
  private readonly exporter = inject(ExportService);
  private readonly sync = inject(SyncService);
  private readonly document = inject(DOCUMENT);

  private readonly _song = signal<Song | undefined>(undefined);
  private readonly _content = signal('');
  private readonly _ast = signal<SongAst | undefined>(undefined);
  /** Session-only, and the feature's: a transient dialog is not a place, so it
   * is neither persisted nor in the URL (PRD-UI-SHELL.md §7). */
  private readonly _isSettingsOpen = signal(false);

  readonly song = this._song.asReadonly();
  readonly content = this._content.asReadonly();
  readonly ast = this._ast.asReadonly();

  readonly name = computed(() => this._song()?.name ?? '');
  /** The parser's warnings, in the editor's vocabulary and the user's language. */
  readonly markers = computed(() => toMarkers(this._ast()?.warnings ?? []));

  /**
   * The effective render settings for this song: Global ← Song, resolved at
   * render time and never persisted (ADR-0006).
   *
   * No Songbook scope here — the editor edits a song, not a performance of one.
   * The same song rendered inside a songbook resolves differently (Epic 6), which
   * is the cascade working, not a disagreement.
   */
  readonly settingsForSong = computed(() =>
    resolveSettings(this.settings.global(), undefined, this._song()?.settings),
  );

  /**
   * Which alphabet a transpose writes back into the source.
   *
   * Read off the **same** resolved cascade the preview renders with, not a second
   * lookup: the editor's two panes have to agree about a chord's name, and the way
   * to guarantee that is for one value to feed both (ADR-0006 — the effective
   * value is resolved at render time, in one place, and never stored).
   *
   * `?? 'english'` for the same reason `RenderService.layout` does it: a settings
   * bag persisted before this key existed is a complete cascade to the type system
   * and not quite one at runtime.
   */
  readonly notation = computed<ChordNotation>(
    () => this.settingsForSong().notation ?? 'english',
  );

  /**
   * The geometry: **one plan per settled edit**, from the same AST the markers
   * read.
   *
   * A `computed` rather than an effect, because that is what it is — a function
   * of (AST, settings). It recomputes when the debounced reparse lands or a
   * setting changes, and not once per keystroke: the debounce is upstream, in
   * `setContent`, where PARSER-GRAMMAR §Reparse put it.
   */
  readonly plan = computed(() => {
    const ast = this._ast();
    return ast ? this.renderer.layout(ast, this.settingsForSong()) : undefined;
  });

  /**
   * The live preview.
   *
   * Screen, so no inlined font bytes (PRD-RENDERING §2): the face is already
   * loaded by the page's CSS, and base64-ing a few hundred KB of TTF into a
   * string that is re-emitted on every settled edit would be pure waste. Export
   * (Epic 7) asks for the other variant.
   */
  readonly svg = computed(() => {
    const plan = this.plan();
    return plan ? this.renderer.emit(plan) : '';
  });

  private readonly reparser = this.parser.createReparser((ast) =>
    this._ast.set(ast),
  );

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by every edit, cleared by a write. Cheaper and more honest than
   * diffing the song against itself on a timer. */
  private isDirty = false;

  /**
   * Flush on the way out of the *page*, not just out of the route.
   *
   * `onDestroy` covers navigating away inside the app; it never runs when the tab
   * is closed, the browser is quit, or the phone swaps the app out — and those are
   * the moments the last 400 ms of typing was being dropped in silence
   * [corrected: was only flushed on route destroy]. There is no Save button
   * (PRD-INFRASTRUCTURE.md §5), so the promise "local work is never lost" has to
   * survive the one exit the framework cannot see.
   *
   * **Both events, because neither one fires everywhere.** `visibilitychange` to
   * hidden is the last moment a mobile browser reliably gives you — a tab it kills
   * in the background never gets an unload of any kind. `pagehide` covers the
   * desktop close and reload, and the bfcache freeze, where visibility may not
   * change at all. Flushing twice is free: `isDirty` makes the second a no-op.
   *
   * It is fire-and-forget on purpose. The write is an IndexedDB transaction, which
   * a browser will normally let commit while the page goes away; there is no
   * synchronous way to store a song and nothing useful to do with a rejection at
   * that point. Switching tabs mid-song therefore saves too — which is the right
   * behaviour anyway, not a side effect to apologise for.
   */
  private readonly flushOnHide = (): void => {
    if (this.document.visibilityState === 'hidden') {
      void this.flushSave();
    }
  };
  private readonly flushOnPageHide = (): void => {
    void this.flushSave();
  };

  constructor() {
    this.document.addEventListener('visibilitychange', this.flushOnHide);
    this.document.defaultView?.addEventListener(
      'pagehide',
      this.flushOnPageHide,
    );

    inject(DestroyRef).onDestroy(() => {
      this.reparser.cancel();
      this.document.removeEventListener('visibilitychange', this.flushOnHide);
      this.document.defaultView?.removeEventListener(
        'pagehide',
        this.flushOnPageHide,
      );
      // Leaving the editor is a boundary: flush rather than drop. The pending
      // save is the last few hundred milliseconds of typing, and this is exactly
      // the moment a user believes their work is safe (ADR-0004).
      void this.flushSave();
    });
  }

  /**
   * Load the song behind `/songs/:id/edit`.
   *
   * Asked of the store's window first and the repository second: a deep link, a
   * reload, or a search that has since narrowed the window all land here with the
   * song absent from it, and "the row you asked for is not on the current page" is
   * not the same as "it does not exist".
   */
  async load(id: string): Promise<void> {
    const song =
      this.songs.entities().find((s) => s.id === id) ??
      (await this.songs.byId(id));
    if (!song) {
      return;
    }
    this._song.set(song);
    this._content.set(song.content);
    this.session.setCurrentSong(song.id);
    // Parse now rather than on the first keystroke: the preview and the warnings
    // must describe the song you opened, not stay blank until you touch it.
    this._ast.set(this.parser.parse(song.content));
  }

  /**
   * The Song-scope overrides, as the panel wants them: only what this song
   * actually sets (ADR-0006 — sparse; an unset key is not "the default", it is
   * inherited).
   */
  readonly songSettings = computed(
    () => (this._song()?.settings ?? {}) as Record<string, unknown>,
  );

  /** What the panel shows behind an unset row, and what "reset" reveals. */
  readonly inheritedSettings = computed(
    () => this.settings.global() as Record<string, unknown>,
  );

  readonly isSettingsOpen = this._isSettingsOpen.asReadonly();

  toggleSettings(): void {
    this._isSettingsOpen.update((open) => !open);
  }

  closeSettings(): void {
    this._isSettingsOpen.set(false);
  }

  /**
   * A sparse patch from the panel. `undefined` means "reset" — **delete the key**
   * rather than storing the inherited value, or the song would pin today's global
   * default forever and the cascade would stop reaching it (ADR-0006).
   *
   * **Setting a value that equals the inherited one deletes the key too.** Storing
   * it would be the same pin by a different route: the song would look overridden,
   * offer a reset button that changes nothing visible, and quietly stop following
   * the global if it ever moved. "Same as inherited" and "not set" are the same
   * state, so dialling a value back to the global is a reset — and it should not
   * take a second click on a Reset button to make it one.
   */
  patchSettings(patch: Record<string, unknown>): void {
    const song = this._song();
    if (!song) {
      return;
    }
    const inherited = this.settings.global() as Record<string, unknown>;
    const settings: Record<string, unknown> = { ...song.settings };
    for (const [key, value] of Object.entries(patch)) {
      // Compared as text: a `2` typed into a field must read equal to the `2`
      // stepped into it, and the panel's controls hand back strings.
      if (value === undefined || String(value) === String(inherited[key])) {
        delete settings[key];
      } else {
        settings[key] = value;
      }
    }
    this._song.set({
      ...song,
      settings: settings as Song['settings'],
      updatedAt: Date.now(),
    });
    // Settings are part of the song, and the same promise covers them: nothing
    // the user changes here needs a Save button (ADR-0001 — content and settings
    // are separate fields of one record, not separate documents).
    this.isDirty = true;
    this.scheduleSave();
  }

  /**
   * Rename the song from the editor's title.
   *
   * The library list has a rename action, but you cannot see the list from in
   * here — so a song created and immediately written in stayed called "New song"
   * until you went back out to fix it. The name is a field of the same record as
   * the content (ADR-0001), so it rides the same autosave and needs no more
   * ceremony than typing does.
   *
   * A blank name is refused rather than stored: the list would render an
   * unclickable empty row, and nothing else identifies the song there.
   */
  rename(name: string): void {
    const song = this._song();
    const trimmed = name.trim();
    if (!song || !trimmed || trimmed === song.name) {
      return;
    }
    this._song.set({ ...song, name: trimmed, updatedAt: Date.now() });
    this.isDirty = true;
    this.scheduleSave();
  }

  /** An edit from the editor. Debounced into one reparse per settled edit. */
  setContent(content: string): void {
    this._content.set(content);
    this.reparser.schedule(content);
    this.isDirty = true;
    this.scheduleSave();
  }

  /**
   * Keystroke-debounced autosave to IndexedDB (PRD-INFRASTRUCTURE.md §5:
   * "local save = A, aggressive. Local work is never lost").
   *
   * There is no Save button and never will be — this is the whole persistence
   * story for a song's text. The delay is short because the only thing it buys is
   * not writing once per keystroke; it is not a grace period for the user to
   * change their mind, and undo is the editor's job (session-only, per CONTEXT).
   */
  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  /** Write now, if anything has changed since the last write. */
  async flushSave(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const song = this._song();
    if (!song || !this.isDirty) {
      return;
    }
    this.isDirty = false;

    const content = this._content();
    // The parser cache is DERIVED, never authored (PRD-DOMAIN-MODEL §Song):
    // rewritten from the content on every save, so the library list and the
    // render can never disagree about a song's title. Parsed fresh rather than
    // read off `_ast`, which a boundary flush can outrun by one debounce — and a
    // stale title in the library is worse than a parse we know is sub-millisecond.
    const ast = this.parser.parse(content);
    const saved: Song = {
      ...song,
      content,
      cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
      updatedAt: Date.now(),
    };

    this._song.set(saved);
    await this.songs.upsert(saved);
    // The explorer's window is sorted and filtered by things that just moved —
    // the name's neighbours, `changed`, the searched title.
    await this.songs.refresh();
    // A save is one of the coarse sync boundaries (ADR-0004) — schedule a
    // debounced push. No-op unless automatic sync is active.
    this.sync.pushSoon();
  }

  /**
   * Shift every valid chord by `semitones`, **rewriting the source**
   * (CONTEXT.md §Transpose) — not decorating the render. The rewrite goes back
   * through `content`, so it lands in the editor as an outside edit and joins the
   * undo history like any other change: transpose is mutating and undoable, which
   * is only true because it is a real edit to real text.
   *
   * Invalid brackets (`[Solo]`, `[x2]`) are left exactly as written, and so is
   * every other character — `transposeContent` is a token rewrite, not a reformat.
   *
   * The rewrite is spelled in this song's resolved `notation`, so a German author
   * gets `H` back where they wrote `H` rather than the English `B` — the editor
   * and the preview stop contradicting each other about the same chord. Only the
   * text changes: `H` and `B` print identically under German, and identically to
   * before under English.
   */
  transpose(semitones: number): void {
    const next = transposeContent(
      this._content(),
      semitones,
      this.theory,
      this.notation(),
    );
    if (next !== this._content()) {
      this.setContent(next);
    }
  }

  /** Session-only, like the settings dialog: a transient sheet is not a place. */
  private readonly _isDownloadOpen = signal(false);
  /** True while a file is being generated — the dialog swaps its formats for a
   * spinner and refuses to close mid-render. */
  private readonly _isDownloading = signal(false);
  readonly isDownloadOpen = this._isDownloadOpen.asReadonly();
  readonly isDownloading = this._isDownloading.asReadonly();

  openDownload(): void {
    this._isDownloadOpen.set(true);
  }

  closeDownload(): void {
    // A render in flight owns the dialog until it finishes; there is nothing to
    // cancel back to and the file is already being written.
    if (!this._isDownloading()) {
      this._isDownloadOpen.set(false);
    }
  }

  /**
   * This song as a bug report attaches it (`FeedbackContext`).
   *
   * **The export envelope, unchanged** — the same `ExportService.snapshot` the
   * download dialog writes to a file. That is the point: a renderer bug is
   * reproduced by loading the song back, and a bespoke "report format" would be a
   * second serialization of a song that could drift from the one Import can read.
   * Paste this straight into Import and you are looking at what they were.
   *
   * Flushed first for the same reason `download` flushes: the export reads the
   * **saved record**, so an unsaved edit would attach a song one debounce behind
   * the screen. (Leaving the editor already flushes, so by the time this is called
   * from Settings it is a no-op — but this must also be right if it is ever called
   * with the editor still up.)
   *
   * `globalSettings` rides alongside rather than inside, because the render is a
   * **cascade**: the envelope carries the song's own overrides and Export
   * deliberately omits the `user` row (§ExportService), so on its own it cannot
   * say what the other half of the resolved settings was. Kept out of `data` so
   * the envelope stays exactly an export — and it is the render defaults only,
   * never the account row that holds them.
   */
  async feedbackSnapshot(): Promise<Record<string, unknown>> {
    const song = this._song();
    if (!song) return {};
    await this.flushSave();
    return {
      export: await this.exporter.snapshot({ songIds: [song.id] }),
      globalSettings: this.settings.global(),
    };
  }

  /**
   * The song being edited, as a file — a PNG or PDF through `DownloadService`,
   * or the Achordeon `.json` through `ExportService`. One dialog asks, and this
   * splits the answer back into the two acts (CONTEXT.md §Export, §Download).
   *
   * The last keystrokes are flushed first, whichever way it goes: both services
   * read the **saved record**, not this presenter's live signal, so an unsaved
   * edit would write a song one debounce behind what is on screen.
   */
  async download(choice: DownloadChoice): Promise<void> {
    const song = this._song();
    if (!song || this._isDownloading()) {
      return;
    }
    this._isDownloading.set(true);
    await this.flushSave();
    try {
      if (choice === DATA_FORMAT) {
        await this.exporter.export({ songIds: [song.id] });
      } else {
        // The dialog only offers png/pdf for one song (its count is 1), so the
        // multi-song members of DownloadFormat never arrive here.
        await this.downloads.downloadSong(song.id, choice as SongFormat);
      }
    } finally {
      this._isDownloading.set(false);
      this._isDownloadOpen.set(false);
    }
  }
}
