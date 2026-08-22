import BrowserOnly from '@docusaurus/BrowserOnly';
import { translate } from '@docusaurus/Translate';
import { useState, type ReactNode } from 'react';

import SongEditor from './editor';
import SongRender from './render';

import styles from './styles.module.css';

/**
 * A live example of the song language: the markup on one side, the app's own
 * render of it on the other, and the markup is editable.
 *
 * The render is `SongRender` — the real pipeline (`parse` + `layoutCore` +
 * `emit`), shared with the tutorial's `SongChallenge`. This component is just the
 * two-up frame: the editable markup on the left, that render on the right.
 *
 * Uncontrolled by default (it owns the edited markup); pass `value` + `onChange`
 * to lift that state to a parent — which is how `SongChallenge` reads the markup
 * to grade it and writes it back for "Show solution", without a second copy of
 * this frame.
 */
export interface SongPreviewProps {
  /** The markup, as written in the .mdx page. The editor's initial document. */
  content: string;
  /** The current markup, when a parent owns it. Omit to let this component own it. */
  value?: string;
  /** Notified on every edit, when a parent owns the markup. */
  onChange?: (next: string) => void;
}

/** The .mdx template literal starts on the line after the backtick. */
function trimSource(content: string): string {
  return content.replace(/^\n/, '').replace(/\s+$/, '');
}

export default function SongPreview({
  content,
  value,
  onChange,
}: SongPreviewProps): ReactNode {
  // Uncontrolled unless the parent passes both halves: its `value` is the markup,
  // its `onChange` the sink. The internal state is the fallback, seeded from
  // `content` — the initial document either way.
  const [internal, setInternal] = useState(() => trimSource(content));
  const source = value ?? internal;
  const setSource = onChange ?? setInternal;

  const sourceCaption = translate({
    id: 'songPreview.source',
    message: 'Markup',
    description: 'Caption above the editable song markup of a live example',
  });

  return (
    <div className={styles.preview}>
      <div className={styles.column}>
        <span className={styles.caption}>{sourceCaption}</span>
        {/* CodeMirror is a DOM editor and the site is pre-rendered, so the
            editor is mounted in the browser and nowhere else. Until it is, the
            markup is shown as it will be typed — a static page that had nothing
            here would flash empty on every load. */}
        <BrowserOnly fallback={<pre className={styles.fallback}>{source}</pre>}>
          {() => (
            <SongEditor
              value={source}
              onChange={setSource}
              label={sourceCaption}
            />
          )}
        </BrowserOnly>
      </div>
      <SongRender content={source} />
    </div>
  );
}
