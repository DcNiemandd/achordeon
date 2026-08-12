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
