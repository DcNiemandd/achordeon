import 'fake-indexeddb/auto';
import type { Song } from '@achordeon/shared/domain';
import { AchordeonDb } from './db';
import { exportDbBlob, importDbBlob } from './snapshot-blob';

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

describe('snapshot blob', () => {
  it('exports the whole DB and imports it into a fresh instance', async () => {
    const source = new AchordeonDb(`blob-${dbSeq++}`);
    await source.songs.bulkPut([song('a'), song('b', { deletedAt: 7 })]);
    await source.meta.put({ key: 'deviceId', value: 'device-1' });

    const blob = await exportDbBlob(source);

    const target = new AchordeonDb(`blob-${dbSeq++}`);
    await importDbBlob(target, blob);

    expect((await target.songs.toArray()).map((s) => s.id).sort()).toEqual([
      'a',
      'b',
    ]);
    // Tombstone and meta ride along in the physical dump.
    expect((await target.songs.get('b'))?.deletedAt).toBe(7);
    expect((await target.meta.get('deviceId'))?.value).toBe('device-1');

    await source.delete();
    await target.delete();
  });

  it('replaces existing rows on import (clearTablesBeforeImport)', async () => {
    const source = new AchordeonDb(`blob-${dbSeq++}`);
    await source.songs.put(song('kept'));
    const blob = await exportDbBlob(source);

    const target = new AchordeonDb(`blob-${dbSeq++}`);
    await target.songs.put(song('stale'));
    await importDbBlob(target, blob);

    expect((await target.songs.toArray()).map((s) => s.id)).toEqual(['kept']);

    await source.delete();
    await target.delete();
  });
});
