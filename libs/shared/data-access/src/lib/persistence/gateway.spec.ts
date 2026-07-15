import 'fake-indexeddb/auto';
import { SCHEMA_VERSION, type Song } from '@achordeon/shared/domain';
import { AchordeonDb } from './db';
import { bootstrap, snapshotFromDb, writeSnapshotToDb } from './gateway';

function song(id: string, over: Partial<Song> = {}): Song {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: id,
    content: '',
    favorite: false,
    settings: {},
    cache: { title: '', subtitle: '' },
    ...over,
  };
}

let dbSeq = 0;

describe('boot gateway', () => {
  let db: AchordeonDb;

  beforeEach(() => {
    db = new AchordeonDb(`gw-${dbSeq++}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('boots a fresh DB at the current version and mints a device id', async () => {
    const result = await bootstrap(db);
    expect(result.status).toBe('ok');
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.deviceId).toBeTruthy();

    // The version stamp is now persisted for future breaking-bump detection.
    expect(await db.meta.get('schemaVersion')).toMatchObject({
      value: String(SCHEMA_VERSION),
    });
  });

  it('keeps the same device id across boots', async () => {
    const first = await bootstrap(db);
    const second = await bootstrap(db);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('leaves current-version data untouched', async () => {
    await db.songs.bulkPut([song('a'), song('b', { deletedAt: 5 })]);
    await bootstrap(db);

    const ids = (await db.songs.toArray()).map((s) => s.id).sort();
    expect(ids).toEqual(['a', 'b']); // tombstone preserved, nothing dropped
  });

  it('refuses data written by a newer breaking build and leaves it untouched', async () => {
    await db.meta.put({
      key: 'schemaVersion',
      value: String(SCHEMA_VERSION + 1),
    });
    await db.songs.put(song('a', { name: 'FromNewerApp' }));

    const result = await bootstrap(db);
    expect(result.status).toBe('refuse');
    // Data not rewritten; the stored (newer) version is reported back.
    expect(result.schemaVersion).toBe(SCHEMA_VERSION + 1);
    expect((await db.songs.get('a'))?.name).toBe('FromNewerApp');
  });

  it('warns when data carries unknown (additive-from-newer) setting keys', async () => {
    await db.meta.put({ key: 'schemaVersion', value: String(SCHEMA_VERSION) });
    await db.songs.put(
      song('a', { settings: { futureSetting: 42 } as Song['settings'] }),
    );

    const result = await bootstrap(db);
    expect(result.status).toBe('warn');
    // Preserve-unknown: the unrecognised key survives the boot.
    const stored = (await db.songs.get('a')) as Song & {
      settings: { futureSetting?: number };
    };
    expect(stored.settings.futureSetting).toBe(42);
  });

  it('round-trips the whole library through snapshot read/write', async () => {
    await db.songs.bulkPut([song('a'), song('b')]);
    const snapshot = await snapshotFromDb(db);
    expect(snapshot.data.songs).toHaveLength(2);
    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);

    const fresh = new AchordeonDb(`gw-${dbSeq++}`);
    await writeSnapshotToDb(fresh, snapshot);
    expect((await fresh.songs.toArray()).map((s) => s.id).sort()).toEqual([
      'a',
      'b',
    ]);
    await fresh.delete();
  });
});
