import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useRef, type ReactNode } from 'react';

import {
  achordeonHighlight,
  achordeonHighlightStyle,
} from '@achordeon/shared/editor-core';

import { theory } from './theory';

import styles from './styles.module.css';

/**
 * The app's editor, in the docs.
 *
 * Grammar and colours come from `shared/editor-core` — the same two files the
 * Angular editor mounts (ADR-0010) — so a chord is the brand colour and `[Solo]`
 * is a grey annotation here for exactly the reason it is there. What this does
 * *not* bring over is the rest of that component: no lint gutter, no line
 * numbers, no snippet buttons, no markers. Those answer questions a reader of the
 * syntax page is not asking.
 */
export interface SongEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Names the editor for a screen reader — it has no `<label>` to point at. */
  label: string;
}

/**
 * The editor's own chrome. Colours are the four custom properties
 * `achordeonHighlightStyle` names, mapped to Infima in `styles.module.css` —
 * nothing here is a literal, so the dark theme needs no second copy.
 */
const chrome = EditorView.theme({
  '&': {
    fontSize: 'var(--ifm-code-font-size)',
    background: 'transparent',
    color: 'var(--text)',
    // Fill the box the CSS module drew, however few lines are in it. Left to
    // itself the editor is exactly as tall as its text, so the rest of a
    // `min-height` box below a two-line example belonged to nothing: clicking
    // there was a click on the panel, and the caret never appeared. (`flex`
    // rather than `height: 100%` — the wrapper is a flex column, so the box is
    // the one thing that does not depend on a resolvable parent height.)
    flex: '1',
  },
  '.cm-content': {
    // The face the render is set in: the two halves of the example should look
    // like the same document at two stages, not like a form and a picture.
    fontFamily: "'Roboto Mono', var(--ifm-font-family-monospace)",
    padding: '0.75rem',
    lineHeight: '1.5',
    // …and the *document* fills the editor, which is what actually makes the
    // empty space a click target: below the last line it is still `.cm-content`
    // under the pointer, so CodeMirror puts the caret on the nearest position.
    minHeight: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  // The default selection is a browser blue that belongs to no palette we own.
  '.cm-selectionBackground, ::selection': {
    background: 'var(--ifm-color-emphasis-300)',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: 'var(--ifm-color-emphasis-300)',
  },
});

export default function SongEditor({
  value,
  onChange,
  label,
}: SongEditorProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /**
   * The live `onChange`, read at the moment of the edit.
   *
   * The update listener is baked into the view's state when it is created, and
   * the view is created once — so capturing the first render's prop would freeze
   * this editor to it. A ref is the escape: the extension reads it, so it always
   * calls the current one, and the view never has to be rebuilt (which would
   * throw the reader's cursor away mid-word).
   */
  const notify = useRef(onChange);
  notify.current = onChange;

  useEffect(() => {
    if (!host.current) {
      return;
    }
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          achordeonHighlight(theory),
          syntaxHighlighting(achordeonHighlightStyle()),
          chrome,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              notify.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mount once. `value` is the *initial* document; afterwards the editor owns
    // it, and re-running this on every keystroke would rebuild the view under
    // the reader's hands. (`label` likewise: it is read into the view's state at
    // creation, and this page's captions do not change after that.)
  }, []);

  /**
   * An edit from outside — nothing does this today, but a reset button would.
   * Guarded against the round trip: our own `onChange` feeds the state that comes
   * straight back here, and writing it would move the cursor to the end on every
   * keystroke. Same guard the app's `syncDoc` makes, for the same reason.
   */
  useEffect(() => {
    const instance = view.current;
    if (!instance || instance.state.doc.toString() === value) {
      return;
    }
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: value },
    });
  }, [value]);

  return <div className={styles.editor} ref={host} />;
}
