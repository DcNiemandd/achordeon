import 'fake-indexeddb/auto';
import type { Song } from '@achordeon/shared/domain';
import { AchordeonDb } from './db';
import { applyFirstRun, type GuideSongText } from './guide-song';

let dbSeq = 0;

const ENGLISH: GuideSongText = {
  name: 'My first song',
  content: '* My first song\n** A quick tour\n\nVerse: A [C]chord.\n',
  cache: { title: 'My first song', subtitle: 'A quick tour' },
};

const CZECH: GuideSongText = {
  name: 'Moje první píseň',
  content: '* Moje první píseň\n** Rychlá prohlídka\n\nSloka: [C]Akord.\n',
  cache: { title: 'Moje první píseň', subtitle: 'Rychlá prohlídka' },
};

/**
 * The guide row, found by its text.
 *
 * Never by position: it shares the table with the starter library now, and Dexie's
 * order is by primary key — a uuid — so "the first row" is whichever id sorted
 * lowest, not the guide.
 */
async function guideOf(
  db: AchordeonDb,
  text: GuideSongText,
): Promise<Song | undefined> {
  return (await db.songs.toArray()).find((s) => s.content === text.content);
}

/** Everything the starter library contributed — the guide row excluded. */
async function starterRows(
  db: AchordeonDb,
  guide: GuideSongText,
): Promise<Song[]> {
  return (await db.songs.toArray()).filter((s) => s.content !== guide.content);
}

describe('applyFirstRun', () => {
  let db: AchordeonDb;

  beforeEach(() => {
    db = new AchordeonDb(`guide-${dbSeq++}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('a first-ever boot', () => {
    it('writes the guide song', async () => {
      const outcome = await applyFirstRun(db, ENGLISH);

      expect(outcome).toBe('seeded');
      const song = await guideOf(db, ENGLISH);
      expect(song?.name).toBe(ENGLISH.name);
      expect(song?.cache).toEqual(ENGLISH.cache);
      expect(song?.deletedAt).toBeNull();
      expect(song?.favorite).toBe(false);
    });

    it('writes the starter library alongside it, in the same call', async () => {
      await applyFirstRun(db, ENGLISH);

      // The two used to guard on the same emptiness check and lock each other out,
      // so that they both land is the point of this file owning the write.
      expect((await starterRows(db, ENGLISH)).length).toBeGreaterThan(0);
      expect(await db.songbooks.count()).toBeGreaterThan(0);
    });

    it('links the songbook to songs that are really there', async () => {
      await applyFirstRun(db, ENGLISH);
      const ids = new Set((await db.songs.toArray()).map((s) => s.id));

      for (const book of await db.songbooks.toArray()) {
        expect(book.entries.length).toBeGreaterThan(0);
        for (const entry of book.entries) expect(ids.has(entry)).toBe(true);
      }
    });

    it('leaves the guide as the most recently changed row', async () => {
      await applyFirstRun(db, ENGLISH);
      const guide = await guideOf(db, ENGLISH);

      // `SongsPresenter.autoSelect` opens the newest row, so this is what makes a
      // first-time user land on the tour rather than on a sample.
      for (const other of await starterRows(db, ENGLISH)) {
        expect(other.updatedAt).toBeLessThan(guide?.updatedAt as number);
      }
    });

    it('brings a favourite and a styled song with it', async () => {
      await applyFirstRun(db, ENGLISH);
      const starter = await starterRows(db, ENGLISH);

      expect(starter.some((s) => s.favorite)).toBe(true);
      expect(starter.some((s) => Object.keys(s.settings).length > 0)).toBe(
        true,
      );
    });
  });

  describe('every boot after', () => {
    it('does nothing in the same language', async () => {
      await applyFirstRun(db, ENGLISH);
      const before = await db.songs.toArray();

      expect(await applyFirstRun(db, ENGLISH)).toBe('nothing');
      expect(await db.songs.toArray()).toEqual(before);
    });

    it('never touches a library that already has songs', async () => {
      const now = Date.now();
      await db.songs.put({
        id: 'mine',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        name: 'Mine',
        content: '* Mine\n',
        favorite: false,
        settings: {},
        cache: { title: 'Mine', subtitle: '' },
      });

      expect(await applyFirstRun(db, ENGLISH)).toBe('nothing');
      expect(await db.songs.count()).toBe(1);
      expect(await db.songbooks.count()).toBe(0);
    });

    it('rewrites the untouched guide when the language changed', async () => {
      await applyFirstRun(db, ENGLISH);
      const seeded = await guideOf(db, ENGLISH);
      const total = await db.songs.count();

      expect(await applyFirstRun(db, CZECH)).toBe('relanguaged');
      const song = await guideOf(db, CZECH);
      expect(song?.id).toBe(seeded?.id);
      expect(song?.name).toBe(CZECH.name);
      expect(song?.cache).toEqual(CZECH.cache);
      // A real edit to a synced row, so it must look like one.
      expect(song?.updatedAt).toBeGreaterThanOrEqual(
        seeded?.updatedAt as number,
      );
      // And it replaced the row rather than adding one.
      expect(await db.songs.count()).toBe(total);
    });

    it('leaves the starter songs alone when it re-languages', async () => {
      await applyFirstRun(db, ENGLISH);
      const before = await starterRows(db, ENGLISH);

      await applyFirstRun(db, CZECH);

      // They are fixed source text with nothing to translate, and only the guide is
      // stamped — so a language switch must not touch them.
      expect(await starterRows(db, CZECH)).toEqual(before);
    });

    it('stays swappable after a swap — a second switch works too', async () => {
      await applyFirstRun(db, ENGLISH);
      await applyFirstRun(db, CZECH);

      expect(await applyFirstRun(db, ENGLISH)).toBe('relanguaged');
      expect(await guideOf(db, ENGLISH)).toBeDefined();
    });

    it('keeps the guide pristine when a starter song is edited', async () => {
      await applyFirstRun(db, ENGLISH);
      const [sample] = await starterRows(db, ENGLISH);
      await db.songs.put({
        ...sample,
        content: 'my own words',
        updatedAt: sample.updatedAt + 1000,
      });

      // The stamp names one row. Editing a *sample* is not editing the tour, so the
      // tour must still follow the language.
      expect(await applyFirstRun(db, CZECH)).toBe('relanguaged');
      expect(await guideOf(db, CZECH)).toBeDefined();
      expect((await db.songs.get(sample.id))?.content).toBe('my own words');
    });

    it('leaves an edited guide alone, in any language, forever', async () => {
      await applyFirstRun(db, ENGLISH);
      const seeded = await guideOf(db, ENGLISH);
      await db.songs.put({
        ...(seeded as Song),
        content: 'my own words',
        updatedAt: (seeded?.updatedAt as number) + 1000,
      });

      expect(await applyFirstRun(db, CZECH)).toBe('nothing');
      expect((await db.songs.get(seeded?.id as string))?.content).toBe(
        'my own words',
      );
      // The stamp is gone, so a later switch back cannot reclaim the row either.
      expect(await applyFirstRun(db, ENGLISH)).toBe('nothing');
      expect((await db.songs.get(seeded?.id as string))?.content).toBe(
        'my own words',
      );
    });

    it('leaves a deleted guide deleted, and seeds no replacement', async () => {
      await applyFirstRun(db, ENGLISH);
      const seeded = await guideOf(db, ENGLISH);
      const total = await db.songs.count();
      await db.songs.put({ ...(seeded as Song), deletedAt: Date.now() });

      expect(await applyFirstRun(db, CZECH)).toBe('nothing');
      expect(await db.songs.count()).toBe(total);
      expect(
        (await db.songs.get(seeded?.id as string))?.deletedAt,
      ).not.toBeNull();
    });

    it('treats a corrupt stamp as no stamp, without touching existing songs', async () => {
      await applyFirstRun(db, ENGLISH);
      const total = await db.songs.count();
      await db.meta.put({ key: 'guideSong', value: 'not json' });

      expect(await applyFirstRun(db, CZECH)).toBe('nothing');
      expect(await db.songs.count()).toBe(total);
      expect(await guideOf(db, ENGLISH)).toBeDefined();
    });
  });
});
