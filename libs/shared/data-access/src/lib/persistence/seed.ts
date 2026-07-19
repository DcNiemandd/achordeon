// Dev/demo seeding — Epic 4 follow-up
// Spec: PRD-INFRASTRUCTURE.md §2 (this and the gateway are the only writers of
// IndexedDB). Not part of the Snapshot and never synced — seed rows are ordinary
// songs the moment they land, indistinguishable from ones you typed.

import type { Song, Songbook, SongSettings } from '@achordeon/shared/domain';
import type { AchordeonDb } from './db';

/**
 * A curated starter library, as source text.
 *
 * Public-domain and traditional material only, kept to a verse or two — enough to
 * exercise the list, search, sort, favourites, songbooks, and every render path
 * (titles, labels, chord-over-character, a chord-only "bridge" block, a second
 * column) without reproducing a copyrighted song. `cache` is authored to match
 * the `*`/`**` lines rather than parsed: the seeder stays free of the ChordTheory
 * port, and the first render/edit re-derives it anyway (PRD-DOMAIN-MODEL §Song).
 */
interface SeedSong {
  name: string;
  title: string;
  subtitle: string;
  content: string;
  favorite?: boolean;
  settings?: SongSettings;
}

const SEED_SONGS: readonly SeedSong[] = [
  {
    name: 'Amazing Grace',
    title: 'Amazing Grace',
    subtitle: 'John Newton, 1779',
    favorite: true,
    content: `* Amazing Grace
** John Newton, 1779

Verse: A[G]mazing [G7]grace, how [C]sweet the [G]sound
that [G]saved a [Em]wretch like [D]me.
I [G]once was [G7]lost, but [C]now am [G]found,
was [Em]blind, but [D7]now I [G]see.
`,
  },
  {
    name: 'Scarborough Fair',
    title: 'Scarborough Fair',
    subtitle: 'Traditional',
    content: `* Scarborough Fair
** Traditional

Verse: [Am]Are you going to [C]Scarborough [G]Fair?
[Am]Parsley, [C]sage, rose[G]mary and [Am]thyme.
Re[Am]member me to [G]one who lives [Am]there,
for [Am]once she [G]was a true love of [Am]mine.
`,
  },
  {
    name: 'House of the Rising Sun',
    title: 'The House of the Rising Sun',
    subtitle: 'Traditional',
    content: `* The House of the Rising Sun
** Traditional

Verse: There [Am]is a [C]house in [D]New Or[F]leans,
they [Am]call the [C]Rising [E]Sun.
And it's [Am]been the [C]ruin of [D]many a poor [F]boy,
and [Am]God, I [E]know I'm [Am]one.
`,
  },
  {
    name: 'Swing Low',
    title: 'Swing Low, Sweet Chariot',
    subtitle: 'Spiritual',
    settings: { titleFont: 'serif' },
    content: `* Swing Low, Sweet Chariot
** Spiritual

Chorus: Swing [G]low, sweet [C]chari[G]ot,
coming for to carry me [D]home.
Swing [G]low, sweet [C]chari[G]ot,
coming for to [D]carry me [G]home.
`,
  },
  {
    name: 'Feature Tour',
    title: 'Feature Tour',
    subtitle: 'What the renderer does',
    settings: { columns: 2 },
    content: `* Feature Tour
** What the renderer does

Verse: A chord sits over the [C]character it names,
right where the [G]sound changes.

Chorus: The words before a colon are a [F]label.
A blank line starts a new [C]block.

Bridge: [C] [G] [Am] [F]

Outro: A line of only chords is an instrumental,
and it renders a little larger.
`,
  },
];

/** Songbooks reference songs by index into `SEED_SONGS`, resolved to ids below. */
const SEED_BOOKS: readonly {
  name: string;
  subtitle: string;
  songs: number[];
}[] = [
  {
    name: 'Sunday Set',
    subtitle: 'A short set to play through',
    songs: [0, 3, 1],
  },
];

function buildSongs(now: number): Song[] {
  return SEED_SONGS.map((s, i) => ({
    id: crypto.randomUUID(),
    // Spread the timestamps so "recently changed" has a real order rather than a
    // five-way tie — the first entry reads as the most recent.
    createdAt: now - i * 1000,
    updatedAt: now - i * 1000,
    deletedAt: null,
    name: s.name,
    content: s.content,
    favorite: s.favorite ?? false,
    settings: s.settings ?? {},
    cache: { title: s.title, subtitle: s.subtitle },
  }));
}

function buildBooks(now: number, songs: readonly Song[]): Songbook[] {
  return SEED_BOOKS.map((b, i) => ({
    id: crypto.randomUUID(),
    createdAt: now - i * 1000,
    updatedAt: now - i * 1000,
    deletedAt: null,
    name: b.name,
    title: b.name,
    subtitle: b.subtitle,
    author: '',
    settings: {},
    entries: b.songs.map((index) => songs[index].id),
  }));
}

/**
 * Fill an **empty** library with the starter set. Returns the number of songs
 * written, `0` when it declined.
 *
 * **Only ever touches an empty library** — never clobbers or duplicates what is
 * already there, so a second call (a reload with the trigger still in the URL) is
 * a no-op, and a user who has deleted the samples does not get them resurrected.
 * Clearing the whole database is the way back to a clean seed. The trigger itself
 * (a `?seed` query param, a dev toggle) lives in the composition layer, not here;
 * this function only knows how to seed, not when.
 */
export async function seedDatabase(db: AchordeonDb): Promise<number> {
  if ((await db.songs.count()) > 0) {
    return 0;
  }
  const now = Date.now();
  const songs = buildSongs(now);
  const books = buildBooks(now, songs);
  await db.transaction('rw', db.songs, db.songbooks, async () => {
    await db.songs.bulkPut(songs);
    await db.songbooks.bulkPut(books);
  });
  return songs.length;
}
