import 'fake-indexeddb/auto';
import { AchordeonDb } from './db';
import { seedDatabase } from './seed';

let dbSeq = 0;

describe('seedDatabase', () => {
  let db: AchordeonDb;

  beforeEach(() => {
    db = new AchordeonDb(`seed-${dbSeq++}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('fills an empty library with songs and a songbook', async () => {
    const count = await seedDatabase(db);

    expect(count).toBeGreaterThan(0);
    expect(await db.songs.count()).toBe(count);
    expect(await db.songbooks.count()).toBeGreaterThan(0);
  });

  it('links the songbook to real seeded song ids', async () => {
    await seedDatabase(db);
    const [book] = await db.songbooks.toArray();
    const ids = new Set((await db.songs.toArray()).map((s) => s.id));

    expect(book.entries.length).toBeGreaterThan(0);
    for (const entry of book.entries) {
      expect(ids.has(entry)).toBe(true);
    }
  });

  it('declines when the library already has a song — never duplicates', async () => {
    const first = await seedDatabase(db);
    const again = await seedDatabase(db);

    expect(again).toBe(0);
    // The second call added nothing on top of the first.
    expect(await db.songs.count()).toBe(first);
  });
});
