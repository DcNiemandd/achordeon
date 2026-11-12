// The insert-syntax buttons, driven the way the toolbar drives them — Epic 5 ▸ subtask 5
// Spec: docs/PARSER-GRAMMAR.md §Emphasis; CONTEXT.md §Content syntax
//
// What a button DOES to a document is behaviour, and behaviour belongs here rather
// than in a hand-traced argument about `emphasisSpans`. The domain spec pins which
// asterisks pair with which; this one pins what the user sees happen, which is a
// different question and the one the bug reports are always about.
//
// Each case is written as the document itself, `|` for the caret and `«…»` for a
// selection, so the test reads the way the bug was reported.

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { EditorView } from '@codemirror/view';
import { ChordTheory } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { SNIPPETS } from './snippets';
import { SongEditor } from './song-editor';

describe('SongEditor — emphasis buttons', () => {
  let fixture: ComponentFixture<SongEditor>;

  /**
   * The editor's own `EditorView`.
   *
   * Reached into on purpose: a selection is something a user makes with a mouse
   * and the component has no input for one (ADR-0010 keeps `EditorView` off the
   * seam, which is right — but "the user had this selected" is exactly what these
   * cases are about). A test-only setter on the component would be the same reach
   * with a nicer name and a permanent cost to the public shape.
   */
  function view(): EditorView {
    const held = (fixture.componentInstance as unknown as { view: EditorView })
      .view;
    expect(held).not.toBeNull();
    return held;
  }

  /** `|` is the caret, `«…»` a selection; everything else is the document. */
  function positions(spec: string): { doc: string; from: number; to: number } {
    let doc = '';
    let from = 0;
    let to = 0;
    for (const char of spec) {
      if (char === '|') {
        from = to = doc.length;
      } else if (char === '«') {
        from = doc.length;
      } else if (char === '»') {
        to = doc.length;
      } else {
        doc += char;
      }
    }
    return { doc, from, to };
  }

  /** Mount the editor on `spec`'s document, with `spec`'s caret or selection. */
  function open(spec: string): void {
    const { doc, from, to } = positions(spec);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ChordTheory, useClass: TonalChordTheory }],
    });
    fixture = TestBed.createComponent(SongEditor);
    fixture.componentRef.setInput('content', doc);
    fixture.detectChanges();
    view().dispatch({ selection: { anchor: from, head: to } });
  }

  /** The document and where the user is in it, in the same notation. */
  function shown(): string {
    const state = view().state;
    const doc = state.doc.toString();
    const { from, to } = state.selection.main;
    return from === to
      ? `${doc.slice(0, from)}|${doc.slice(from)}`
      : `${doc.slice(0, from)}«${doc.slice(from, to)}»${doc.slice(to)}`;
  }

  const bold = () => fixture.componentInstance.insert(SNIPPETS.bold);
  const italic = () => fixture.componentInstance.insert(SNIPPETS.italic);

  describe('taking emphasis off', () => {
    // Both bugs were the same one: the button read the asterisks it could TOUCH,
    // so a phrase already bold was invisible to it and got a second pair.

    it('un-bolds the phrase around the caret, not the word under it', () => {
      open('**Karn|eval karneval**');
      bold();
      expect(shown()).toBe('Karn|eval karneval');
    });

    it('un-bolds the phrase a selection was drawn around, markers and all', () => {
      open('«**Karneval karneval**»');
      bold();
      expect(shown()).toBe('«Karneval karneval»');
    });

    it('un-bolds a phrase selected without its markers', () => {
      open('**«Karneval karneval»**');
      bold();
      expect(shown()).toBe('«Karneval karneval»');
    });

    it('takes off the bit it owns and leaves the other one alone', () => {
      open('***Karn|eval***');
      italic();
      expect(shown()).toBe('**Karn|eval**');
    });
  });

  describe('putting emphasis on', () => {
    it('bolds the word under the caret when there is no emphasis yet', () => {
      open('Karn|eval karneval');
      bold();
      expect(shown()).toBe('**Karn|eval** karneval');
    });

    it('opens an empty pair on whitespace, ready to type', () => {
      open('Karneval | karneval');
      bold();
      expect(shown()).toBe('Karneval **|** karneval');
    });

    it('adds its own bit to a phrase that already has the other', () => {
      open('**Karn|eval karneval**');
      italic();
      expect(shown()).toBe('***Karn|eval karneval***');
    });

    it('bolds a hand-picked part of a phrase, leaving the phrase italic', () => {
      // Less than the whole span is what a selection is for — the span rule must
      // not swallow a range the user drew inside one. The closing `***` is the
      // bold's pair and the italic's one, which is how Phase 2 reads it back.
      open('*Karneval «karneval»*');
      bold();
      expect(shown()).toBe('*Karneval **«karneval»***');
    });
  });

  describe('the innermost span wins', () => {
    it('un-italicises the inner phrase from a caret in it', () => {
      open('**a *b|c* d**');
      italic();
      expect(shown()).toBe('**a b|c d**');
    });

    it('un-bolds the outer phrase from a caret outside the inner one', () => {
      open('**a| *bc* d**');
      bold();
      expect(shown()).toBe('a| *bc* d');
    });
  });

  describe('what is not a marker', () => {
    it('leaves an asterisk that only prints where it is', () => {
      // Nothing matches the `*` in `(2*)`, so it is text and the caret is in a
      // plain word — the button has a word to bold, not a span to strip.
      open('Refrain (2*) ag|ain');
      bold();
      expect(shown()).toBe('Refrain (2*) **ag|ain**');
    });

    it('does not read an asterisk inside a chord', () => {
      open('[Solo*] Karn|eval');
      bold();
      expect(shown()).toBe('[Solo*] **Karn|eval**');
    });
  });
});

describe('SongEditor — a paste it can take back', () => {
  let fixture: ComponentFixture<SongEditor>;
  let pasted: string[];
  let withdrawn: number;

  function view(): EditorView {
    return (fixture.componentInstance as unknown as { view: EditorView }).view;
  }

  /** Mount on `doc` with the caret at `|`. */
  function open(spec: string): void {
    const at = spec.indexOf('|');
    const doc = spec.replace('|', '');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ChordTheory, useClass: TonalChordTheory }],
    });
    fixture = TestBed.createComponent(SongEditor);
    fixture.componentRef.setInput('content', doc);
    fixture.detectChanges();
    view().dispatch({ selection: { anchor: at } });
    pasted = [];
    withdrawn = 0;
    fixture.componentInstance.pasted.subscribe((text) => pasted.push(text));
    fixture.componentInstance.pasteWithdrawn.subscribe(() => withdrawn++);
  }

  /** What CodeMirror's own paste handler dispatches. */
  function paste(text: string): void {
    const { from, to } = view().state.selection.main;
    view().dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: 'input.paste',
    });
  }

  function type(text: string): void {
    const { head } = view().state.selection.main;
    view().dispatch({
      changes: { from: head, insert: text },
      selection: { anchor: head + text.length },
      userEvent: 'input.type',
    });
  }

  const doc = () => view().state.doc.toString();
  const replacePaste = (text: string) =>
    fixture.componentInstance.replacePaste(text);
  const undo = () => fixture.componentInstance.undo();

  it('says what was pasted', () => {
    open('Before\n|');
    paste('Am F\nWords');
    expect(pasted).toEqual(['Am F\nWords']);
  });

  it('does not take typing for a paste', () => {
    open('|');
    type('Words');
    expect(pasted).toEqual([]);
  });

  it('replaces exactly what was pasted', () => {
    open('Before\n|\nAfter');
    paste('Am F\nWords');
    replacePaste('[Am]Wo[F]rds');
    expect(doc()).toBe('Before\n[Am]Wo[F]rds\nAfter');
  });

  it('gives the paste back, as pasted, on one undo', () => {
    open('Before\n|\nAfter');
    paste('Am F\nWords');
    replacePaste('[Am]Wo[F]rds');
    undo();
    expect(doc()).toBe('Before\nAm F\nWords\nAfter');
  });

  it('replaces its own replacement when asked again', () => {
    open('Before\n|\nAfter');
    paste('Hmi\nWords');
    replacePaste('[Bm]Words');
    replacePaste('[Hmi]Words');
    expect(doc()).toBe('Before\n[Hmi]Words\nAfter');
  });

  it('lets the paste go once the person edits, and replaces nothing after', () => {
    open('|');
    paste('Am F\nWords');
    type('!');
    expect(withdrawn).toBe(1);
    replacePaste('[Am]Words');
    expect(doc()).toBe('Am F\nWords!');
  });

  it('does not count its own replacement as an edit', () => {
    open('|');
    paste('Am F\nWords');
    replacePaste('[Am]Words');
    expect(withdrawn).toBe(0);
  });
});

describe('SongEditor — a transform of the selection', () => {
  let fixture: ComponentFixture<SongEditor>;

  function view(): EditorView {
    return (fixture.componentInstance as unknown as { view: EditorView }).view;
  }

  /** `«…»` is the selection; without one, the caret sits at the end. */
  function open(spec: string): void {
    const from = spec.indexOf('«');
    const doc = spec.replace('«', '').replace('»', '');
    const to = from === -1 ? doc.length : spec.indexOf('»') - 1;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ChordTheory, useClass: TonalChordTheory }],
    });
    fixture = TestBed.createComponent(SongEditor);
    fixture.componentRef.setInput('content', doc);
    fixture.detectChanges();
    view().dispatch({
      selection: { anchor: from === -1 ? doc.length : from, head: to },
    });
  }

  const doc = () => view().state.doc.toString();
  const shout = (text: string) => text.toUpperCase();
  const transform = (fn: (text: string) => string) =>
    fixture.componentInstance.transformSelection(fn);

  it('transforms only what is selected', () => {
    open('Before\n«Am\nWords»\nAfter');
    transform(shout);
    expect(doc()).toBe('Before\nAM\nWORDS\nAfter');
  });

  it('transforms the whole song when nothing is selected', () => {
    open('Am\nWords');
    transform(shout);
    expect(doc()).toBe('AM\nWORDS');
  });

  it('is undone in one step', () => {
    open('Before\n«Am\nWords»\nAfter');
    transform(shout);
    fixture.componentInstance.undo();
    expect(doc()).toBe('Before\nAm\nWords\nAfter');
  });

  it('leaves no undo step behind when nothing changed', () => {
    open('Typed');
    view().dispatch({
      changes: { from: 5, insert: ' more' },
      userEvent: 'input.type',
    });
    transform((text) => text);
    fixture.componentInstance.undo();
    expect(doc()).toBe('Typed');
  });
});
