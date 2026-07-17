// CodeMirror adapter — Epic 5 ▸ subtask 4
// Spec: ADR-0010 (CodeMirror 6, loosely coupled); docs/PARSER-GRAMMAR.md

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { ChordTheory } from '@achordeon/shared/domain';
import { achordeonHighlight, achordeonTags } from './highlight';
import type { EditorMarker, InsertRequest } from './editor-model';

/**
 * **The only file in the app that knows CodeMirror exists** (ADR-0010).
 *
 * Everything crosses this boundary as a string, an `EditorMarker`, or an
 * `InsertRequest` — never an `EditorView`, a `Diagnostic` or a `Transaction`. That
 * is the whole property: swapping editors later rewrites this file and its
 * grammar, not the domain, the parser, or their tests. **Treat a CodeMirror import
 * outside this folder as a defect.**
 *
 * It is a controlled component with one honest exception: the document. A signal
 * cannot own a text buffer that also holds a cursor, a selection and an undo
 * history, so CodeMirror owns the doc and reports changes out. `content` is a
 * *reconciled* input — see `syncDoc`.
 */
@Component({
  selector: 'app-song-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="host" #host data-testid="editor"></div>`,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
    }

    /* The editor's own look lives in editorTheme(), not here: CodeMirror builds
       its .cm-* elements itself, so they never carry this component's
       encapsulation attribute and no rule written here would ever match them.
       That is not a quirk to work around — CM's theme facet is how it is meant
       to be styled, and it keeps the styles scoped to this instance. */
    .host {
      block-size: 100%;
    }
  `,
})
export class SongEditor {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly theory = inject(ChordTheory);

  /**
   * The song's content text.
   *
   * Reconciled, not applied: writing every keystroke back into the doc would
   * fight the user for the cursor. See `syncDoc` for when it wins.
   */
  readonly content = input.required<string>();
  readonly markers = input<readonly EditorMarker[]>([]);
  readonly editorLabel = input($localize`:@@editor.label:Song content`);
  readonly placeholderText = input(
    $localize`:@@editor.placeholder:Type your song here.`,
  );

  /** Fired on every settled edit. Debouncing is the caller's business — parse
   * and autosave want different delays from the same keystroke. */
  readonly contentChange = output<string>();

  private view: EditorView | null = null;

  constructor() {
    afterNextRender(() => this.mount());
    inject(DestroyRef).onDestroy(() => this.view?.destroy());

    // Two inputs, two reconciliations, deliberately separate: markers arrive on
    // every reparse and must not touch the document.
    effect(() => this.syncDoc(this.content()));
    effect(() => this.syncMarkers(this.markers()));
  }

  /** Insert at the cursor, wrapping the selection if there is one (subtask 5). */
  insert(request: InsertRequest): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const after = request.after ?? '';
    const text = request.before + selected + after;
    // Caret lands where the next keystroke belongs: inside `[]`, or after the
    // text we just wrapped.
    const caret =
      from +
      (request.caretOffset !== undefined
        ? request.before.length + request.caretOffset
        : text.length);

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: caret },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Session-only undo/redo (PRD-INFRASTRUCTURE.md §11) — the editor's history,
   * not the database's. */
  undo(): void {
    if (this.view) {
      undo(this.view);
      this.view.focus();
    }
  }

  redo(): void {
    if (this.view) {
      redo(this.view);
      this.view.focus();
    }
  }

  focus(): void {
    this.view?.focus();
  }

  private mount(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.content(),
        extensions: this.extensions(),
      }),
    });
    this.syncMarkers(this.markers());
  }

  private extensions(): Extension[] {
    return [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      placeholder(this.placeholderText()),
      achordeonHighlight(this.theory),
      syntaxHighlighting(this.highlightStyle()),
      this.editorTheme(),
      lintGutter(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.contentChange.emit(update.state.doc.toString());
        }
      }),
      EditorView.contentAttributes.of({
        'aria-label': this.editorLabel(),
        // The content is a song, not code: it should not be announced as a
        // multi-line code editor, and it must be findable by its label.
        role: 'textbox',
      }),
    ];
  }

  /**
   * The chrome: ours from line one (ADR-0010 — "own the theming").
   *
   * Every value is a design token, so the editor follows the app into dark mode
   * without a second theme. It should look like Achordeon, not like an IDE
   * someone embedded in Achordeon.
   */
  private editorTheme(): Extension {
    return EditorView.theme({
      '&': {
        blockSize: '100%',
        backgroundColor: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-md)',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'var(--font-ui)',
        lineHeight: 'var(--leading-normal)',
      },
      '.cm-content': { padding: 'var(--space-2) 0' },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-raised)',
        borderInlineEnd: '1px solid var(--border)',
        color: 'var(--text-faint)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--brand-subtle)',
        color: 'var(--brand)',
      },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--brand) 4%, transparent)',
      },
      '.cm-cursor, .cm-dropCursor': { borderInlineStartColor: 'var(--text)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: 'var(--brand-subtle)' },
      // A warning is an underline, not a red wall: the text stays readable.
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--brand)',
        textUnderlineOffset: '3px',
      },
    });
  }

  /** Our tags → our tokens. The colours are the theme's, never literals. */
  private highlightStyle(): HighlightStyle {
    return HighlightStyle.define([
      { tag: achordeonTags.title, color: 'var(--text)', fontWeight: '700' },
      {
        tag: achordeonTags.subtitle,
        color: 'var(--text-muted)',
        fontWeight: '500',
      },
      {
        tag: achordeonTags.label,
        color: 'var(--text-muted)',
        fontWeight: '700',
      },
      // Chords are the brand colour, as they are in the render: the editor should
      // rhyme with the page it is producing.
      { tag: achordeonTags.chord, color: 'var(--brand)', fontWeight: '700' },
      {
        tag: achordeonTags.annotation,
        color: 'var(--text-faint)',
        fontStyle: 'italic',
      },
      { tag: achordeonTags.escape, color: 'var(--text-faint)' },
    ]);
  }

  /**
   * Write `content` into the doc only when it genuinely differs.
   *
   * The guard is what makes an input and a live editor able to coexist: our own
   * `contentChange` feeds a signal that comes straight back here, and applying it
   * would replace the document the user is typing in — resetting the cursor to the
   * end on every keystroke. A difference that survives that round trip is a real
   * outside edit (a transpose rewrites the whole source), and those must land.
   */
  private syncDoc(content: string): void {
    const view = this.view;
    if (!view || view.state.doc.toString() === content) {
      return;
    }
    const caret = Math.min(view.state.selection.main.anchor, content.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: { anchor: caret },
    });
  }

  /**
   * Push the markers in, rather than registering a `linter()` source.
   *
   * A `linter()` is a *source*: CodeMirror asks it, on its own schedule, when the
   * document changes. Our diagnostics do not come from the document — they come
   * from `ParserService`, one debounce later, and are already decided by the time
   * they get here (ADR-0010: the editor never parses anything itself). `linter()`
   * had already run and gone quiet before the AST existed, so nothing was ever
   * underlined. `setDiagnostics` is the push half of the same extension.
   */
  private syncMarkers(markers: readonly EditorMarker[]): void {
    void markers; // read for the effect's dependency; the work reads it again
    const view = this.view;
    if (view) {
      view.dispatch(setDiagnostics(view.state, this.diagnostics()));
    }
  }

  /** `EditorMarker` (line + range) → CodeMirror's absolute document offsets. */
  private diagnostics(): Diagnostic[] {
    const view = this.view;
    if (!view) {
      return [];
    }
    const doc = view.state.doc;
    const out: Diagnostic[] = [];
    for (const marker of this.markers()) {
      // A marker can outlive the text it describes by one reparse — the doc has
      // already changed, the AST has not caught up. Drop it rather than throw:
      // CodeMirror rejects an out-of-range diagnostic outright.
      if (marker.line < 0 || marker.line >= doc.lines) {
        continue;
      }
      const line = doc.line(marker.line + 1);
      const from = marker.range ? line.from + marker.range[0] : line.from;
      const to = marker.range ? line.from + marker.range[1] : line.to;
      out.push({
        from: Math.max(line.from, Math.min(from, line.to)),
        to: Math.max(line.from, Math.min(to, line.to)),
        severity: 'warning',
        message: marker.message,
      });
    }
    return out;
  }
}
