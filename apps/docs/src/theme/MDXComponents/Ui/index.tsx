import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { type ReactNode } from 'react';

import strings from '@site/src/generated/ui-strings.json';

/**
 * A label quoted from the app, by id rather than by hand.
 *
 * `<Ui id="songbooks.add" />` renders whatever `@@songbooks.add` says in the
 * reader's language — "New songbook" on the English site, "Nový zpěvník" on the
 * Czech one. The docs name the string; the app owns the words. Rename a button
 * and both languages of every page that quotes it follow, instead of drifting
 * until somebody notices.
 *
 * The table is generated (`tools/gen-ui-strings.mjs`) and holds only the ids the
 * docs actually use, so quoting a label costs its own bytes and not the app's
 * whole translation file.
 */
export default function Ui({
  id,
  icon,
}: {
  /** The `$localize` id, without the `@@` (`songbooks.add`). */
  id: string;
  /**
   * A glyph the button carries beside its text, if it does — `icon="+"` renders
   * `+ New songbook`, which is what the reader is looking for on screen. Text
   * rather than the app's real icon: this is a name to recognise in a sentence,
   * not a picture of the control.
   */
  icon?: string;
}): ReactNode {
  const { i18n } = useDocusaurusContext();
  const tables = strings as Record<string, Record<string, string>>;
  // English is the fallback for a locale the app has no table for, and for a
  // string only English has — the same way the docs themselves fall back.
  const text = tables[i18n.currentLocale]?.[id] ?? tables['en']?.[id];
  if (!text) {
    throw new Error(
      `<Ui id="${id}"> — no such string. Add the id to a page and re-run gen-ui-strings.`,
    );
  }

  return <code>{icon ? `${icon} ${text}` : text}</code>;
}
