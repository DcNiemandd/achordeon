// The demo song `fit-a-song-on-one-page.mdx` is a walkthrough of — one per
// language, from one recipe.
//
// The tutorial hands the reader a link and then repairs the song it carries,
// setting by setting. So there are two things that must never drift apart: the
// link printed in the `.mdx`, and the song the screenshots are of. Both come
// from here — the shots build their link with `demoSongLink`, and
// `tools/gen-demo-song-link.mjs` writes the same string into the two tutorial
// pages.
//
// **The settings are the fixture; the words are translation.** Every step of the
// tutorial names a value (`columns` 6, `padding` 4, the title on the spine), so
// those live once, in `BROKEN`, and both languages get them verbatim. Only the
// song's own text is per locale — a Czech reader repairing an English page would
// be reading a screenshot of somebody else's song.

import { gzipSync } from 'node:zlib';

// Type-only: this file is bundled on its own by `tools/gen-demo-song-link.mjs`,
// and a value import would drag the whole harness (and Playwright) in with it.
import type { Locale } from './harness';

/** Where the app that reads the link lives — the envelope names its origin. */
const APP_URL = 'https://achordeon.eu/app/';

/**
 * The instant the envelope claims to have been written.
 *
 * Fixed, because `updatedAt` is what an import compares when the same song is
 * already in the library — and because a timestamp taken at generation time
 * would rewrite the link (and the two `.mdx` pages) on every run, for no change
 * anybody made.
 */
const WRITTEN_AT = 1787443200000;

/**
 * What is wrong with the song, in the app's own setting names.
 *
 * Every one of these is a step of the tutorial, and the numbers are quoted in
 * its prose — six columns for five blocks, a border four text sizes deep, the
 * words in the bottom-right corner, the title up the left edge. Shared by both
 * languages so the walkthrough reads true in either.
 */
const BROKEN = {
  scale: 'auto',
  aspectRatio: 'A4',
  columns: 6,
  padding: 4,
  blockGap: 4,
  contentX: 'right',
  contentY: 'bottom',
  titlePosition: 'left',
} as const;

interface DemoText {
  /** Fixed per locale, so importing the link twice updates the song rather than
   * piling up copies — and so a shot can open the editor on it directly. */
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly content: string;
}

const TEXT: Record<Locale, DemoText> = {
  en: {
    id: 'f17a0000-0e11-4a9e-9a5e-000000000001',
    name: 'Fit Me On One Page',
    title: 'Fit Me On One Page',
    subtitle: 'A demo song that arrives badly set',
    content: `* Fit Me On One Page
** A demo song that arrives badly set

Verse: I [C]woke up in a [G]corner
with [Am]gutters left and [F]right,
six [C]columns for five [G]verses
and my [F]words are out of [C]sight.

Chorus: Give me [F]back the [C]page,
give me [G]back the [Am]air,
take the [F]border off the [C]paper
and I'll [G]sing from any[C]where.

Verse: The [C]padding is a [G]moat now,
the [Am]title climbs the [F]spine,
and a [C]player with a [G]guitar
can't [F]find the second [C]line.

Bridge: [C] [G] [Am] [F]

Chorus: Give me [F]back the [C]page,
give me [G]back the [Am]air,
one [F]song upon one [C]sheet
with [G]nothing left to [C]spare.
`,
  },
  cs: {
    id: 'f17a0000-0e11-4a9e-9a5e-000000000002',
    name: 'Vejdi se na jednu stránku',
    title: 'Vejdi se na jednu stránku',
    subtitle: 'Ukázková písnička, co dorazí špatně nastavená',
    content: `* Vejdi se na jednu stránku
** Ukázková písnička, co dorazí špatně nastavená

Sloka: Vzbudil [C]jsem se dole [G]v rohu,
mezi [Am]okraji jak [F]zeď,
šest [C]sloupců na pět [G]slok je
a má [F]slova nevidíš [C]teď.

Refrén: Vrať mi [F]zpátky tu [C]stránku,
vrať mi [G]zpátky ten [Am]vzduch,
sundej [F]z papíru ten [C]rámec
a já [G]zahraju ti [C]kus.

Sloka: To [C]odsazení je [G]příkop,
můj [Am]nadpis šplhá po [F]hřbetě,
a kdo [C]mě chce dneska [G]zahrát,
ten [F]druhý řádek nenaj[C]de.

Mezihra: [C] [G] [Am] [F]

Refrén: Vrať mi [F]zpátky tu [C]stránku,
vrať mi [G]zpátky ten [Am]vzduch,
jednu [F]píseň na list [C]jeden
a už [G]nic dalšího [C]k tomu.
`,
  },
};

/** The id the link carries in `locale` — what a shot opens the editor on. */
export const demoSongId = (locale: Locale): string => TEXT[locale].id;

/**
 * The export envelope for `locale`, as the JSON a link's fragment holds.
 *
 * The same shape any Achordeon export has (`export-service.ts`): one song, no
 * songbooks, no account. `cache` is authored rather than parsed — the first
 * render re-derives it, exactly as the seeder's rows do.
 */
export function demoSongEnvelope(locale: Locale): string {
  const text = TEXT[locale];
  return JSON.stringify({
    app: APP_URL,
    schemaVersion: 1,
    deviceId: '',
    updatedAt: WRITTEN_AT,
    data: {
      user: [],
      songs: [
        {
          id: text.id,
          createdAt: WRITTEN_AT,
          updatedAt: WRITTEN_AT,
          deletedAt: null,
          name: text.name,
          content: text.content,
          favorite: false,
          settings: BROKEN,
          cache: { title: text.title, subtitle: text.subtitle },
        },
      ],
      songbooks: [],
    },
  });
}

/**
 * The link the tutorial prints, for `locale`.
 *
 * `z1` is the app's own compressed form — gzip, then base64url
 * (`share-link.ts`). The app writes it with `CompressionStream` and this writes
 * it with zlib; the bytes of the two need not match, since what a reader's app
 * does with the fragment is decompress it.
 */
export function demoSongLink(locale: Locale): string {
  const gzipped = gzipSync(Buffer.from(demoSongEnvelope(locale), 'utf8'), {
    level: 9,
  });
  const payload = gzipped
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${APP_URL}#z1=${payload}`;
}
