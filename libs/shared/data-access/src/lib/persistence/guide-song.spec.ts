import 'fake-indexeddb/auto';
import { AchordeonDb } from './db';
import { applyGuideSong, type GuideSongText } from './guide-song';
import { seedDatabase } from './seed';

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

describe('applyGuideSong', () => {
  let db: AchordeonDb;

  beforeEach(() => {
    db = new AchordeonDb(`guide-${dbSeq++}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('writes the guide song into an empty library', async () => {
    const outcome = await applyGuideSong(db, ENGLISH);

    expect(outcome).toBe('seeded');
    const [song] = await db.songs.toArray();
    expect(song.name).toBe(ENGLISH.name);
    expect(song.content).toBe(ENGLISH.content);
    expect(song.cache).toEqual(ENGLISH.cache);
    expect(song.deletedAt).toBeNull();
    expect(song.favorite).toBe(false);
  });

  it('does nothing on the next boot in the same language', async () => {
    await applyGuideSong(db, ENGLISH);
    const before = await db.songs.toArray();

    expect(await applyGuideSong(db, ENGLISH)).toBe('nothing');
    expect(await db.songs.toArray()).toEqual(before);
  });

  it('never touches a library that already has songs', async () => {
    await seedDatabase(db);
    const count = await db.songs.count();

    expect(await applyGuideSong(db, ENGLISH)).toBe('nothing');
    expect(await db.songs.count()).toBe(count);
  });

  it('rewrites the untouched song when the language changed', async () => {
    await applyGuideSong(db, ENGLISH);
    const [seeded] = await db.songs.toArray();

    expect(await applyGuideSong(db, CZECH)).toBe('relanguaged');
    const [song] = await db.songs.toArray();
    expect(song.id).toBe(seeded.id);
    expect(song.name).toBe(CZECH.name);
    expect(song.content).toBe(CZECH.content);
    expect(song.cache).toEqual(CZECH.cache);
    // A real edit to a synced row, so it must look like one.
    expect(song.updatedAt).toBeGreaterThanOrEqual(seeded.updatedAt);
    expect(await db.songs.count()).toBe(1);
  });

  it('stays swappable after a swap — a second switch works too', async () => {
    await applyGuideSong(db, ENGLISH);
    await applyGuideSong(db, CZECH);

    expect(await applyGuideSong(db, ENGLISH)).toBe('relanguaged');
    const [song] = await db.songs.toArray();
    expect(song.content).toBe(ENGLISH.content);
  });

  it('leaves an edited song alone, in any language, forever', async () => {
    await applyGuideSong(db, ENGLISH);
    const [seeded] = await db.songs.toArray();
    const mine = {
      ...seeded,
      content: 'my own words',
      updatedAt: seeded.updatedAt + 1000,
    };
    await db.songs.put(mine);

    expect(await applyGuideSong(db, CZECH)).toBe('nothing');
    expect((await db.songs.get(seeded.id))?.content).toBe('my own words');
    // The stamp is gone, so a later switch back cannot reclaim the row either.
    expect(await applyGuideSong(db, ENGLISH)).toBe('nothing');
    expect((await db.songs.get(seeded.id))?.content).toBe('my own words');
  });

  it('leaves a deleted song deleted, and does not seed a replacement', async () => {
    await applyGuideSong(db, ENGLISH);
    const [seeded] = await db.songs.toArray();
    await db.songs.put({ ...seeded, deletedAt: Date.now() });

    expect(await applyGuideSong(db, CZECH)).toBe('nothing');
    expect(await db.songs.count()).toBe(1);
    expect((await db.songs.get(seeded.id))?.deletedAt).not.toBeNull();
  });

  it('treats a corrupt stamp as no stamp, without touching existing songs', async () => {
    await applyGuideSong(db, ENGLISH);
    await db.meta.put({ key: 'guideSong', value: 'not json' });

    expect(await applyGuideSong(db, CZECH)).toBe('nothing');
    expect(await db.songs.count()).toBe(1);
    expect((await db.songs.toArray())[0].content).toBe(ENGLISH.content);
  });
});
