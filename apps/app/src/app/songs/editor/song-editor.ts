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
  signal,
  viewChild,
} from '@angular/core';
import {
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  isolateHistory,
  redo,
  undo,
} from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { ChordTheory, findLabelDelimiter } from '@achordeon/shared/domain';
import { achordeonHighlight, achordeonTags } from './highlight';
import type {
  CaretContext,
  CaretLineKind,
  EditorMarker,
  InsertRequest,
} from './editor-model';

/** Columns per tab stop. Monospace, so a stop is a column count, not a width. */
const TAB_WIDTH = 4;

/**
 * Tab: advance the caret to the next tab stop, **in spaces, at the cursor**.
 *
 * Two deliberate departures from what an editor usually does with Tab.
 *
 * **At the cursor, not the line.** CodeMirror's `indentWithTab` re-indents the
 * whole line, which is right for code and wrong here: you press Tab to push the
 * words *after* the caret across so they sit under a chord, and re-indenting
 * from the line start moves text you were not aiming at.
 *
 * **Spaces, never a tab character.** Chord anchors are character indices
 * (PARSER-GRAMMAR §Phase 2) and the renderer turns an index into a pixel x with
 * `measureText`. A `\t` is one character of wildly unpredictable width — canvas
 * and SVG do not even agree on it — so a single tab would put every chord after
 * it in the wrong place. Spaces make the index and the picture agree.
 *
 * Padding to a stop rather than inserting a fixed run, because the point is
 * alignment: two lines tabbed once line up.
 */
function insertTabStop(view: EditorView): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      const column = range.head - view.state.doc.lineAt(range.head).from;
      const pad = TAB_WIDTH - (column % TAB_WIDTH);
      return {
        changes: { from: range.from, to: range.to, insert: ' '.repeat(pad) },
        range: EditorSelection.cursor(range.from + pad),
      };
    }),
    { userEvent: 'input.indent', scrollIntoView: true },
  );
  return true;
}

/**
 * Is `column` inside an open `[…]` on this line?
 *
 * Walks to the caret tracking whether a bracket is open, skipping escaped
 * characters exactly as the parser does — `\[` is a literal bracket and opens
 * nothing (PARSER-GRAMMAR §Escapes). Brackets do not nest, so an already-open one
 * is enough to know a second `[` would be a mistake.
 */
function isInsideBracket(text: string, column: number): boolean {
  let isOpen = false;
  for (let i = 0; i < column && i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++; // whatever follows is literal, including a bracket
    } else if (char === '[') {
      isOpen = true;
    } else if (char === ']') {
      isOpen = false;
    }
  }
  return isOpen;
}

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
  /** Announced with the field, because Tab no longer leaves it (see `extensions`). */
  readonly escapeHint = input(
    $localize`:@@editor.escapeHint:Tab inserts spaces. Press Escape to leave the editor.`,
  );

  /** Fired on every settled edit. Debouncing is the caller's business — parse
   * and autosave want different delays from the same keystroke. */
  readonly contentChange = output<string>();

  private view: EditorView | null = null;

  /**
   * What kind of line the caret is on.
   *
   * The toolbar reads it to grey out actions the grammar would ignore here — a
   * chord written into a title is literal text, because a `*` line never reaches
   * the inline scan (PARSER-GRAMMAR §Phase 1). Classified with the same two
   * prefixes Phase 1 uses, and nothing else: this is a hint for enabling buttons,
   * not a second parser (ADR-0010).
   */
  private readonly _caret = signal<CaretContext>({
    lineKind: 'content',
    isInsideChord: false,
  });
  readonly caret = this._caret.asReadonly();

  private syncCaret(state: EditorState): void {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const lineKind: CaretLineKind = line.text.startsWith('** ')
      ? 'subtitle'
      : line.text.startsWith('* ')
        ? 'title'
        : 'content';
    this._caret.set({
      lineKind,
      isInsideChord: isInsideBracket(line.text, head - line.from),
    });
  }

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

    // A blank line inside an already-blank block adds nothing the parser can see,
    // so pressing the button again is a no-op rather than a growing gap.
    if (request.hasBlankBlockGuard && this.isInBlankBlock(from)) {
      view.focus();
      return;
    }

    if (request.atLineStart) {
      // Line-scoped: prefix the line, REPLACING any marker it already carries, so
      // the button is idempotent and Title/Subtitle interchange.
      const line = view.state.doc.lineAt(from);

      // A line can hold only one label, so on a labelled line the button goes to
      // it rather than writing a second delimiter in front of the first.
      if (request.movesToExistingLabel) {
        const delimiter = findLabelDelimiter(line.text);
        if (delimiter !== -1) {
          // Before the whole colon run, which is where the label's NAME ends —
          // a run may be `::`, and landing between its colons would split it.
          let runStart = delimiter;
          while (runStart > 0 && line.text[runStart - 1] === ':') {
            runStart--;
          }
          view.dispatch({
            selection: { anchor: line.from + runStart },
            scrollIntoView: true,
          });
          view.focus();
          return;
        }
      }
      const existing = request.replacesLineStart?.exec(line.text)?.[0] ?? '';
      // Already exactly this marker: nothing to write. Rewriting it would cost
      // an undo step for no visible change — but do move the caret to the end of
      // the line, because pressing "Title" on a line that is already a title
      // means "let me write the title", and leaving the caret where it was made
      // the button look broken.
      if (existing === request.before) {
        view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
        view.focus();
        return;
      }
      const shift = request.before.length - existing.length;
      // Leave the caret where the user left it, shifted by what changed in front
      // of it — clicking a button mid-word must not drag focus to the marker.
      // `caretOffset` overrides that and counts from the line start instead,
      // which is how Label lands the caret in the empty name it just opened.
      const anchor =
        request.caretOffset !== undefined
          ? line.from + request.caretOffset
          : Math.max(line.from, from + shift);
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from + existing.length,
          insert: request.before,
        },
        selection: { anchor },
        scrollIntoView: true,
      });
      view.focus();
      return;
    }

    if (request.atLineEnd) {
      // Acts on the line as a unit from below, the way `atLineStart` does from
      // above: the text goes after the line, and the caret follows it there.
      const end = view.state.doc.lineAt(to).to;
      view.dispatch({
        changes: { from: end, insert: request.before },
        selection: { anchor: end + request.before.length },
        scrollIntoView: true,
      });
      view.focus();
      return;
    }

    const selected = view.state.sliceDoc(from, to);
    const text = request.before + selected + (request.after ?? '');
    // With text selected, the wrapping is the point and the caret belongs after
    // it. With none, `caretOffset` puts the caret where the next keystroke goes —
    // between the brackets of an empty `[]`, not after them.
    const caret =
      from +
      (selected === '' && request.caretOffset !== undefined
        ? request.before.length + request.caretOffset
        : text.length);

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: caret },
      scrollIntoView: true,
    });
    view.focus();
  }

  /**
   * True when the caret sits in a block that is already empty — at the very start
   * of the document, or with a blank line immediately behind it.
   *
   * "Block" is the parser's (PARSER-GRAMMAR §Block boundaries): text separated by
   * blank lines. Reading backwards from the caret is enough, because what is
   * ahead belongs to the next block and cannot make this one non-empty.
   */
  private isInBlankBlock(at: number): boolean {
    const view = this.view;
    if (!view) {
      return false;
    }
    const line = view.state.doc.lineAt(at);
    if (line.text.slice(0, at - line.from).trim() !== '') {
      return false; // there is content behind the caret on this line
    }
    if (line.number === 1) {
      return true; // top of the document — no block to separate from
    }
    return view.state.doc.line(line.number - 1).text.trim() === '';
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
    this.syncCaret(this.view.state);
  }

  private extensions(): Extension[] {
    return [
      lineNumbers(),
      history(),
      // Tab LAST, so it only claims the key where nothing else wanted it.
      //
      // CodeMirror leaves Tab unbound on purpose: capturing it costs a keyboard
      // user the normal way out of a control. We take it anyway, because a Tab
      // that silently jumped to the toolbar was the bug being reported. WCAG
      // 2.1.2 permits this exactly when the user is told the way out, so Escape
      // leaves the editor and `aria-description` below says so.
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        { key: 'Tab', run: insertTabStop },
        { key: 'Shift-Tab', run: indentLess },
      ]),
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
        // Moving the caret changes it too, not just editing — clicking into a
        // title line has to disable the chord button as surely as typing one.
        if (update.docChanged || update.selectionSet) {
          this.syncCaret(update.state);
        }
      }),
      EditorView.contentAttributes.of({
        'aria-label': this.editorLabel(),
        // Tab is captured here, so the way out has to be announced rather than
        // discovered — that is the condition WCAG 2.1.2 attaches to taking it.
        'aria-description': this.escapeHint(),
        'aria-keyshortcuts': 'Escape',
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
      '.cm-content': {
        padding: 'var(--space-2) 0',
        // The caret. We do not use `drawSelection`, so CodeMirror shows the
        // NATIVE caret, and `caret-color: auto` was resolving to black — which
        // vanished on the dark surface. This is the fix; the `.cm-cursor` rule
        // below only bites if a drawn-selection layer is ever added.
        caretColor: 'var(--text)',
      },
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
      // Only used with a drawn-selection layer (we render the native caret via
      // caret-color above). Kept correct for that day: CodeMirror draws this
      // caret as `border-left` — a physical property — so the override has to be
      // `border-left-color`, not the logical `border-inline-start-color`, or it
      // sets a different property and loses the cascade.
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: 'var(--brand-subtle)' },
      // A warning is an underline, not a red wall: the text stays readable.
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--brand)',
        textUnderlineOffset: '3px',
      },

      // The warning's own panel. CodeMirror ships a hard-coded light skin for
      // these (#f5f5f5 on #fff with a #ddd border), which our theme never
      // touched — so in dark mode it was pale text on a pale box and the message
      // explaining the warning was the one thing you could not read. Every
      // surface here is a token, like the rest of the editor.
      '.cm-tooltip': {
        backgroundColor: 'var(--surface-overlay)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-2)',
      },
      '.cm-tooltip .cm-tooltip-arrow:before': {
        borderTopColor: 'var(--border)',
        borderBottomColor: 'var(--border)',
      },
      '.cm-tooltip .cm-tooltip-arrow:after': {
        borderTopColor: 'var(--surface-overlay)',
        borderBottomColor: 'var(--surface-overlay)',
      },
      '.cm-diagnostic': {
        padding: 'var(--space-1) var(--space-2)',
        borderInlineStart: '3px solid var(--brand)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-tight)',
      },
      '.cm-diagnostic-warning': { borderInlineStartColor: 'var(--brand)' },
      // The gutter dot, same story: its default is a bright yellow lozenge that
      // belongs to no palette we own.
      '.cm-lint-marker': { color: 'var(--brand)' },
      '.cm-lint-marker-warning': { color: 'var(--brand)' },
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
      // Its own undo step. CodeMirror merges changes that land close together in
      // time, so without this a transpose clicked moments after typing became
      // part of that typing — one Ctrl+Z threw away both. An outside edit is a
      // discrete act (CONTEXT.md §Transpose: "mutating, covered by undo/redo"),
      // and undoing it must mean undoing exactly it.
      annotations: isolateHistory.of('full'),
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
