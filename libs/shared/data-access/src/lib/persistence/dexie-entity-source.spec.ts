import 'fake-indexeddb/auto';
import type { Song } from '@achordeon/shared/domain';
import { AchordeonDb } from './db';
import { DexieEntitySource } from './entity-source';

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

describe('DexieEntitySource', () => {
  let db: AchordeonDb;
  let songs: DexieEntitySource<Song>;

  beforeEach(() => {
    db = new AchordeonDb(`test-${dbSeq++}`);
    songs = new DexieEntitySource<Song>(db.songs);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('round-trips a record through put/get', async () => {
    await songs.put(song('a', { name: 'Alpha' }));
    expect(await songs.get('a')).toMatchObject({ id: 'a', name: 'Alpha' });
  });

  it('bulkPut writes many and all() returns them', async () => {
    await songs.bulkPut([song('a'), song('b'), song('c')]);
    const ids = (await songs.all()).map((s) => s.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('softDelete tombstones in place without removing the row', async () => {
    await songs.put(song('a'));
    await songs.softDelete('a', 999);

    const row = await songs.get('a');
    expect(row).toBeDefined();
    expect(row?.deletedAt).toBe(999);
    expect(row?.updatedAt).toBe(999);
    // all() still carries the tombstone (sync needs it).
    expect((await songs.all()).map((s) => s.id)).toEqual(['a']);
  });

  it('softDelete preserves unrecognised fields (preserve-unknown)', async () => {
    const withUnknown = { ...song('a'), futureField: 'keep-me' } as Song;
    await songs.put(withUnknown);
    await songs.softDelete('a', 5);

    const row = (await songs.get('a')) as Song & { futureField?: string };
    expect(row.futureField).toBe('keep-me');
  });
});
