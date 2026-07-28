// The one song a fresh library is born with
// Spec: PRD-INFRASTRUCTURE.md §2 (this, the seeder and the gateway are the only
// writers of IndexedDB). Not part of the Snapshot's bookkeeping — the row it writes
// is an ordinary song the moment it lands, and syncs like any other.

import type { Song, SongCache } from '@achordeon/shared/domain';
import type { AchordeonDb } from './db';

/**
 * The guide song's text, supplied by the composition layer.
 *
 * The copy is not here — it is `$localize`d, and `shared/*` carries no user-facing
 * strings (PRD-UI-SHELL.md §Where the help text lives). `cache` is derived from
 * `content` by the caller's parser rather than authored, because a per-language
 * cache cannot be authored honestly: whoever holds the text for *this* boot's
 * language is the only one who can say what its title is.
 */
export interface GuideSongText {
  readonly name: string;
  readonly content: string;
  readonly cache: SongCache;
}

/** What `applyGuideSong` did, for the caller's logs and the tests. */
export type GuideSongOutcome = 'seeded' | 'relanguaged' | 'nothing';

/** The `meta` key holding which song is the guide, and what we last wrote to it. */
const META_GUIDE_SONG = 'guideSong';

/**
 * Which row is the guide song, and the `updatedAt` this code last stamped on it.
 *
 * Device-local, in `meta`, outside the Snapshot (`db.ts`) — it is bookkeeping about
 * a row, not part of the row, and a second device has its own.
 */
interface GuideSongStamp {
  id: string;
  stamp: number;
}

/**
 * Give a first-time user one song to look at, and keep it in their language.
 *
 * **First run** — an empty library and no stamp: write the guide song. `count()`
 * includes tombstones, so a user who deleted the samples is never re-seeded, and a
 * library that already has songs (every existing install) never gains one.
 *
 * **Every boot after** — the stamp says which row it is and whether it is still
 * ours. Anything the user does to the song goes through a write that bumps
 * `updatedAt` (`SongsPresenter.write`), so `updatedAt !== stamp` is exactly "they
 * have made it theirs": the stamp is dropped and the row is never touched again.
 * Untouched and the text has changed, which only happens when the UI language did,
 * the content is replaced and re-stamped — so the tour a new user is reading is in
 * the language they are reading the app in.
 *
 * A timestamp rather than a hash of the seeded text because runtime `$localize`
 * hands you only the *active* catalog: booted in English there is no way to obtain
 * the Czech text to compare a Czech row against. The stamp needs to know nothing
 * about any language.
 *
 * The re-language write **does** bump `updatedAt` — it is a real edit to a synced
 * row, and swallowing it would leave two devices disagreeing about the same id. The
 * fresh stamp is what keeps the song pristine for the next switch.
 */
export async function applyGuideSong(
  db: AchordeonDb,
  guide: GuideSongText,
): Promise<GuideSongOutcome> {
  const stamped = await readStamp(db);
  if (stamped === null) {
    if ((await db.songs.count()) > 0) {
      return 'nothing';
    }
    const now = Date.now();
    const song: Song = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: guide.name,
      content: guide.content,
      favorite: false,
      settings: {},
      cache: guide.cache,
    };
    await db.songs.put(song);
    await writeStamp(db, { id: song.id, stamp: now });
    return 'seeded';
  }

  const song = await db.songs.get(stamped.id);
  if (song === undefined || song.deletedAt !== null) {
    // Deleted, or lost with the row. Nothing to keep in step, and nothing to
    // resurrect — a sample the user threw away stays thrown away.
    await clearStamp(db);
    return 'nothing';
  }
  if (song.updatedAt !== stamped.stamp) {
    await clearStamp(db);
    return 'nothing';
  }
  if (song.content === guide.content) {
    return 'nothing';
  }

  const now = Date.now();
  await db.songs.put({
    ...song,
    name: guide.name,
    content: guide.content,
    cache: guide.cache,
    updatedAt: now,
  });
  await writeStamp(db, { id: stamped.id, stamp: now });
  return 'relanguaged';
}

/**
 * `null` for both "never stamped" and "stamped unreadably" — an unparseable stamp
 * names no row, so there is nothing it could protect. The empty-library guard is
 * what makes treating the two alike safe: a corrupt stamp over a library with songs
 * in it still writes nothing.
 */
async function readStamp(db: AchordeonDb): Promise<GuideSongStamp | null> {
  const row = await db.meta.get(META_GUIDE_SONG);
  if (row === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as GuideSongStamp).id === 'string' &&
      typeof (parsed as GuideSongStamp).stamp === 'number'
    ) {
      return parsed as GuideSongStamp;
    }
  } catch {
    // Not JSON. Falls through to the same answer as a missing row.
  }
  return null;
}

async function writeStamp(
  db: AchordeonDb,
  stamp: GuideSongStamp,
): Promise<void> {
  await db.meta.put({ key: META_GUIDE_SONG, value: JSON.stringify(stamp) });
}

async function clearStamp(db: AchordeonDb): Promise<void> {
  await db.meta.delete(META_GUIDE_SONG);
}
