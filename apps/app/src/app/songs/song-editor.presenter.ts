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
  SessionStore,
  SongStore,
} from '@achordeon/shared/data-access';
import {
  ChordTheory,
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
