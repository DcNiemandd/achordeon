// Song editor presenter — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §3; ADR-0010; docs/PARSER-GRAMMAR.md §Reparse

import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ParserService,
  RenderService,
  SessionStore,
  SettingsStore,
  SongStore,
} from '@achordeon/shared/data-access';
import {
  ChordTheory,
  resolveSettings,
  transposeContent,
  type Song,
  type SongAst,
} from '@achordeon/shared/domain';
import { toMarkers } from './editor/warning-copy';

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

  private readonly _song = signal<Song | undefined>(undefined);
  private readonly _content = signal('');
  private readonly _ast = signal<SongAst | undefined>(undefined);

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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reparser.cancel());
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

  /** An edit from the editor. Debounced into one reparse per settled edit. */
  setContent(content: string): void {
    this._content.set(content);
    this.reparser.schedule(content);
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
   */
  transpose(semitones: number): void {
    const next = transposeContent(this._content(), semitones, this.theory);
    if (next !== this._content()) {
      this.setContent(next);
    }
  }
}
