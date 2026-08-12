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
  isolateHistory,
  redo,
  undo,
} from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import {
  ChordTheory,
  bracketAt,
  cycleChordAt,
  emphasisSpans,
  findLabelDelimiter,
  transposeChordAt,
  type ChordNotation,
} from '@achordeon/shared/domain';
import {
  achordeonHighlight,
  achordeonHighlightStyle,
  findVerbatimSpans,
} from '@achordeon/shared/editor-core';
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
 * Shift-Tab: delete back to the previous tab stop, **at the cursor**.
 *
 * The mirror of `insertTabStop`. `indentLess` (the usual binding) only touches a
 * line's *leading* indentation, so after a mid-line Tab there was nothing at the
 * line start for it to remove and it did nothing — the reported bug. This removes
 * the spaces immediately before the caret, up to the previous stop, and stops at
 * the first non-space so it can never eat a word.
 *
 * **Always returns true**, even with nothing to delete: an unconsumed Shift-Tab
 * is a focus change out of the editor, which is the whole thing we are avoiding.
 */
function removeTabStop(view: EditorView): boolean {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const column = range.head - line.from;
    const toStop = column % TAB_WIDTH === 0 ? TAB_WIDTH : column % TAB_WIDTH;
    let n = 0;
    while (n < toStop && line.text[column - n - 1] === ' ') {
      n++;
    }
    return n === 0
      ? { range }
      : {
          changes: { from: range.head - n, to: range.head },
          range: EditorSelection.cursor(range.head - n),
        };
  });
  if (!changes.changes.empty) {
    view.dispatch(changes, { userEvent: 'delete.dedent' });
  }
  return true;
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
  /**
   * The alphabet the sharp/flat buttons write in — this song's resolved
   * `notation`, handed down rather than looked up.
   *
   * The editor holds no settings of its own (ADR-0010: everything crosses this
   * boundary as plain data), and a second read of the cascade is exactly how the
   * two panes would come to disagree about what a chord is called. Defaults to
   * `english`, so an unbound editor behaves as it always has.
   */
  readonly notation = input<ChordNotation>('english');
  readonly editorLabel = input($localize`:@@editor.label:Song content`);
  readonly placeholderText = input(
    $localize`:@@editor.placeholder:Type your song here.`,
  );
  /** Announced with the field, because Tab no longer leaves it (see `extensions`). */
  readonly escapeHint = input(
    $localize`:@@editor.escapeHint:Tab inserts spaces. Press Escape to leave the editor.`,
  );
  /**
   * What a bracket with no chord in it says when you hover it — see
   * `verbatimMarkers`. Phrased as a fact about what will happen, not as a
   * complaint: `[Solo]` is a perfectly good thing to write, and the same sentence
   * has to serve the `[Amm]` that was meant to be a chord.
   */
  readonly verbatimHint = input(
    $localize`:@@editor.verbatimHint:Not a chord Achordeon recognises. It prints exactly as written and transpose leaves it alone.`,
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
      isInsideChord: bracketAt(line.text, head - line.from) !== null,
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
      // Title/Subtitle interchange — and removing its own marker, so each one is
      // a toggle rather than a one-way door.
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
      // Already exactly this marker: take it OFF [corrected: used to just move
      // the caret to the end of the line]. The button says what the line IS, so
      // pressing it on a line that is already a title is the one way to say "this
      // is not a title after all" — and there was no other way to unmake one
      // except deleting the asterisk by hand. Title on a *subtitle* still
      // converts, because that press names a different kind.
      if (existing === request.before) {
        view.dispatch({
          changes: { from: line.from, to: line.from + existing.length },
          selection: { anchor: Math.max(line.from, from - existing.length) },
          scrollIntoView: true,
        });
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

    const after = request.after ?? '';

    let start = from;
    let end = to;
    // Whether the range was chosen FOR the user rather than by them, which is
    // what decides where the caret ends up afterwards.
    let derivedRange = false;

    // An emphasis span the range is really about wins over everything else: the
    // span is the thing the markers made, and both the caret sitting inside one
    // and a selection drawn around one (markers and all) mean "this span". Either
    // way the operation is on the span's TEXT — the markers are what gets
    // rewritten, so they must not be inside the range being rewritten.
    const span = request.togglesEmphasis
      ? this.emphasisSpanFor(from, to)
      : null;
    if (span) {
      start = span.from;
      end = span.to;
      derivedRange = from === to;
    }

    // Otherwise, nothing selected and the caret in a word: act on the whole word
    // (Bold on a word means "make THIS word bold"). A no-op on whitespace, where
    // `wordAt` returns null and we fall back to the empty pair.
    if (!span && from === to && request.wrapsWord) {
      const word = view.state.wordAt(from);
      if (word) {
        start = word.from;
        end = word.to;
        derivedRange = true;
      }
    }

    if (request.togglesEmphasis) {
      this.flipEmphasis(request.togglesEmphasis, start, end, derivedRange);
      return;
    }

    const selected = view.state.sliceDoc(start, end);
    const text = request.before + selected + after;
    // A range we picked keeps the caret on the character it was on — the text
    // only shifted right by the opener. An empty pair uses `caretOffset` to land
    // the caret where the next keystroke goes — between the brackets of `[]`.
    const caret = derivedRange
      ? from + request.before.length
      : start +
        (selected === '' && request.caretOffset !== undefined
          ? request.before.length + request.caretOffset
          : text.length);

    // **A user selection survives the wrap, still selected.** What you picked out
    // is what you are working on, and wrapping it does not change that: it has
    // only moved right by the opener. Collapsing to a caret afterwards made every
    // second press start from nothing — you had to re-select the same word to
    // bold it as well, or to press Chord again and make it inline.
    const hadSelection = from !== to;
    const innerStart = start + request.before.length;
    const anchor = hadSelection ? innerStart : caret;
    const head = hadSelection ? innerStart + selected.length : caret;

    view.dispatch({
      changes: { from: start, to: end, insert: text },
      selection: { anchor, head },
      scrollIntoView: true,
    });
    view.focus();
  }

  /**
   * The TEXT of the emphasis span `[from, to]` is about, in document positions —
   * or null when the range is not about one.
   *
   * Two ways a range means a span, and they are the two ways people press the
   * button. A caret **inside** one: you are standing in bold text and want it to
   * stop. A selection drawn **around** one, markers and all: you swept the phrase
   * with the mouse, which takes the asterisks with it because they are part of the
   * text. Both used to read as "no emphasis here" and wrap a second pair around
   * the first — `****Karneval karneval**` from the caret, `****Karneval
   * karneval****` from the selection.
   *
   * A selection that covers only PART of a span is left alone: picking a range out
   * by hand is how you emphasise less than the whole of one.
   */
  private emphasisSpanFor(
    from: number,
    to: number,
  ): { from: number; to: number } | null {
    const view = this.view;
    if (!view) {
      return null;
    }
    const line = view.state.doc.lineAt(from);
    if (to > line.to) {
      return null; // a selection across lines is nobody's span
    }
    const start = from - line.from;
    const end = to - line.from;
    const spans = emphasisSpans(line.text, findLabelDelimiter(line.text) + 1);
    const span =
      from === to
        ? // Innermost first, so this finds the tightest span around the caret.
          spans.find((s) => s.start + s.length <= start && start <= s.end)
        : spans.find((s) => s.start === start && s.end + s.length === end);
    return span
      ? { from: line.from + span.start + span.length, to: line.from + span.end }
      : null;
  }

  /**
   * Flip one emphasis bit over `[start, end)` — the Bold and Italic buttons.
   *
   * The markers are a **run** of asterisks, not a pair: every pair in it is bold and
   * a lone leftover one is italic, so its length is the state — 1 italic, 2 bold, 3
   * both (PARSER-GRAMMAR §Emphasis). So this reads the run already around the range,
   * flips its own bit, and rewrites the run to whatever length the new pair of bits
   * spells. That is what makes Bold and Italic compose (`*x*` + bold → `***x***`)
   * and undo themselves (`***x***` + italic → `**x**`) instead of stacking a fourth
   * asterisk, which the grammar reads as bold twice over — no emphasis at all.
   *
   * A longer run is read by the same arithmetic and rewritten whole, so pressing a
   * button on `****x****` leaves one clean pair behind instead of a fifth asterisk.
   */
  private flipEmphasis(
    kind: 'italic' | 'bold',
    start: number,
    end: number,
    derivedRange: boolean,
  ): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const { from, to } = view.state.selection.main;

    // The matched run around the range — the shorter side wins, so a half-written
    // `**x*` is read as the one asterisk it really closes.
    const runBefore = this.emphasisRun(start, -1);
    const runAfter = this.emphasisRun(end, 1);
    const run = Math.min(runBefore, runAfter);

    // The run's own arithmetic, whatever its length: a lone leftover asterisk is
    // italic, every pair is bold. The rewrite then spells the new pair of bits in
    // one, two or three, so a long run collapses to a clean one.
    let italic = run % 2 === 1;
    let bold = Math.floor(run / 2) % 2 === 1;
    if (kind === 'italic') italic = !italic;
    else bold = !bold;
    const markers = '*'.repeat((italic ? 1 : 0) + (bold ? 2 : 0));

    const inner = view.state.sliceDoc(start, end);
    const shift = markers.length - run;
    const innerStart = start + shift;

    view.dispatch({
      // One change over the old run, the text, and the old run — never two edits at
      // one empty position, which is what an empty range would otherwise produce.
      changes: {
        from: start - run,
        to: end + run,
        insert: markers + inner + markers,
      },
      selection:
        from !== to
          ? { anchor: innerStart, head: innerStart + inner.length }
          : { anchor: derivedRange ? from + shift : innerStart },
      scrollIntoView: true,
    });
    view.focus();
  }

  /** Length of the run of `*` running away from `at` in `step` direction. */
  private emphasisRun(at: number, step: 1 | -1): number {
    const view = this.view;
    if (!view) {
      return 0;
    }
    const doc = view.state.doc;
    let n = 0;
    for (;;) {
      const index = step === 1 ? at + n : at - n - 1;
      if (index < 0 || index >= doc.length) {
        return n;
      }
      if (view.state.sliceDoc(index, index + 1) !== '*') {
        return n;
      }
      n++;
    }
  }

  /**
   * The Chord button, which has three states in one press: bracket the selection
   * (or the word at the caret), make an existing chord inline, then take the
   * brackets off again.
   *
   * The last two are a source rewrite the domain owns (`cycleChordAt`); only the
   * first needs the editor, because only the editor knows what "the word at the
   * caret" is. So the domain is asked first and the insert is the fallback.
   *
   * A selection survives every state, so the three presses can be made in a row on
   * one chosen word: both ends move by the same amount the caret does, because both
   * sit inside the bracket being rewritten and the rewrite only happens outside
   * them (`[` doubles in front, `]` doubles behind).
   */
  cycleChord(request: InsertRequest): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const { anchor, head } = view.state.selection.main;
    const cycled = cycleChordAt(view.state.doc.toString(), head);
    if (!cycled) {
      this.insert(request);
      return;
    }
    const shift = cycled.caret - head;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: cycled.content },
      selection:
        anchor === head
          ? { anchor: cycled.caret }
          : { anchor: anchor + shift, head: cycled.caret },
      scrollIntoView: true,
      userEvent: 'input.chord',
    });
    view.focus();
  }

  /**
   * Raise (+1) or lower (−1) the ONE chord the caret is inside, re-spelling it —
   * the sharp/flat buttons. A real source edit like transpose (it joins the undo
   * history), but scoped to the bracket under the cursor. A no-op off any chord,
   * which is why the buttons disable themselves off `caret().isInsideChord`.
   *
   * Spelled in `notation()`, the same value the whole-song transpose uses: these
   * two write into one document, and one document should not end up in two
   * alphabets because it was raised by different buttons.
   */
  transposeChordAtCaret(semitones: number): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const head = view.state.selection.main.head;
    const result = transposeChordAt(
      view.state.doc.toString(),
      head,
      semitones,
      this.theory,
      this.notation(),
    );
    if (!result) {
      view.focus();
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.content },
      // Keep the caret inside the bracket even if the chord got shorter (E→Eb
      // grows, C#→C shrinks): clamp it to the bracket's new closing `]`.
      selection: { anchor: Math.min(head, result.bracketEnd) },
      scrollIntoView: true,
      userEvent: 'input.transpose',
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

  /**
   * Put the caret in the text.
   *
   * Also the way in from the keyboard (`Alt+E`, ADR-0015): the action bar above
   * is a dozen tab stops of commands, which made the writing surface — the
   * reason the screen exists — the furthest thing on it from a Tab key.
   */
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
        { key: 'Shift-Tab', run: removeTabStop },
      ]),
      EditorView.lineWrapping,
      placeholder(this.placeholderText()),
      achordeonHighlight(this.theory),
      syntaxHighlighting(achordeonHighlightStyle()),
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
      // A visible wash, not the 0.12-alpha `--brand-subtle`, which vanished on
      // the dark surface — 28% of the brand reads as a highlight in both themes
      // while the text under it stays legible.
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor: 'color-mix(in srgb, var(--brand) 28%, transparent)',
        },
      // A warning is an underline, not a red wall: the text stays readable.
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--brand)',
        textUnderlineOffset: '3px',
      },
      // An explanation is quieter still: dotted, in the faint ink the verbatim
      // bracket is already drawn in, because it marks something that is fine —
      // it just does not do what a chord does. A wavy brand underline here would
      // read as the same alarm the shadowed-title warning raises, and half the
      // annotations in a real song would be wearing it.
      '.cm-lintRange-info': {
        backgroundImage: 'none',
        textDecoration: 'underline dotted var(--text-faint)',
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
      '.cm-diagnostic-info': { borderInlineStartColor: 'var(--text-faint)' },
      // The gutter dot, same story: its default is a bright yellow lozenge that
      // belongs to no palette we own.
      '.cm-lint-marker': { color: 'var(--brand)' },
      '.cm-lint-marker-warning': { color: 'var(--brand)' },
      // No gutter dot for an explanation. The gutter is the column that says
      // "something here needs you", and a song that uses `[Solo]` four times
      // would have four of CodeMirror's lavender boxes in it saying nothing of
      // the kind. The dotted underline and its tooltip are the whole message.
      '.cm-lint-marker-info': { display: 'none' },
    });
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

  /**
   * The bracketed text that is not a chord, as its own quiet markers — a single
   * mistyped name inside a row of good ones (`[Em Am Gmimi]`), or a whole
   * chordless bracket.
   *
   * Ours and not the parser's, on purpose. PARSER-GRAMMAR §Error/warning settled
   * that these are **deliberately not warnings** — `[Solo]`, `[x2]` and `[N.C.]`
   * are exactly what the verbatim-annotation rule is for, and a song full of them
   * is a correct song. But it is also where a mistyped chord goes to hide, prints
   * silently, and survives every transpose. So the editor says what will happen
   * (`severity: 'info'`) instead of the parser saying something is wrong, which is
   * the difference between an explanation and a complaint.
   *
   * Recomputed from the live doc each time the markers land, so it rides the
   * reparse debounce rather than firing a dispatch per keystroke.
   */
  private verbatimMarkers(): EditorMarker[] {
    const view = this.view;
    if (!view) {
      return [];
    }
    const message = this.verbatimHint();
    return findVerbatimSpans(view.state.doc.toString(), this.theory).map(
      (span) => ({
        line: span.line,
        range: span.range,
        message,
        severity: 'info' as const,
      }),
    );
  }

  /** `EditorMarker` (line + range) → CodeMirror's absolute document offsets. */
  private diagnostics(): Diagnostic[] {
    const view = this.view;
    if (!view) {
      return [];
    }
    const doc = view.state.doc;
    const out: Diagnostic[] = [];
    for (const marker of [...this.markers(), ...this.verbatimMarkers()]) {
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
        severity: marker.severity ?? 'warning',
        message: marker.message,
      });
    }
    return out;
  }
}
