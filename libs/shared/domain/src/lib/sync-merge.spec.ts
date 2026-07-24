import { mergeRecords, mergeSnapshots } from './sync-merge';
import type { Song, Songbook, User } from './entities';
import type { SnapshotData } from './snapshot';

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

describe('mergeRecords (per-row LWW)', () => {
  it('keeps the row with the greater updatedAt', () => {
    const local = [song('a', { updatedAt: 10, name: 'old' })];
    const remote = [song('a', { updatedAt: 20, name: 'new' })];
    expect(mergeRecords(local, remote)).toEqual([
      song('a', { updatedAt: 20, name: 'new' }),
    ]);
  });

  it('keeps local when its updatedAt is greater', () => {
    const local = [song('a', { updatedAt: 30, name: 'mine' })];
    const remote = [song('a', { updatedAt: 20, name: 'theirs' })];
    expect(mergeRecords(local, remote)[0].name).toBe('mine');
  });

  it('keeps local on an exact updatedAt tie (stable, no needless write)', () => {
    const local = [song('a', { updatedAt: 10, name: 'mine' })];
    const remote = [song('a', { updatedAt: 10, name: 'theirs' })];
    expect(mergeRecords(local, remote)[0].name).toBe('mine');
  });

  it('unions ids present on only one side', () => {
    const local = [song('a')];
    const remote = [song('b')];
    const ids = mergeRecords(local, remote)
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('propagates a delete: a newer tombstone wins over an older live row', () => {
    const local = [song('a', { updatedAt: 10, deletedAt: null })];
    const remote = [song('a', { updatedAt: 20, deletedAt: 20 })];
    expect(mergeRecords(local, remote)[0].deletedAt).toBe(20);
  });

  it('does not resurrect: a newer live edit wins over an older tombstone', () => {
    const local = [song('a', { updatedAt: 30, deletedAt: null })];
    const remote = [song('a', { updatedAt: 20, deletedAt: 20 })];
    expect(mergeRecords(local, remote)[0].deletedAt).toBeNull();
  });

  it('is commutative on updatedAt (merging either direction converges)', () => {
    const l = [song('a', { updatedAt: 10 }), song('b', { updatedAt: 40 })];
    const r = [song('a', { updatedAt: 20 }), song('b', { updatedAt: 30 })];
    const forward = mergeRecords(l, r).map((x) => [x.id, x.updatedAt]);
    const back = mergeRecords(r, l).map((x) => [x.id, x.updatedAt]);
    expect(forward.sort()).toEqual(back.sort());
  });
});

describe('mergeSnapshots', () => {
  it('merges every table by the same per-row rule', () => {
    const local: SnapshotData = {
      user: [{ id: 'u', createdAt: 1, updatedAt: 5, deletedAt: null } as User],
      songs: [song('s', { updatedAt: 1 })],
      songbooks: [],
    };
    const remote: SnapshotData = {
      user: [{ id: 'u', createdAt: 1, updatedAt: 9, deletedAt: null } as User],
      songs: [song('s', { updatedAt: 2 })],
      songbooks: [
        {
          id: 'b',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        } as Songbook,
      ],
    };
    const merged = mergeSnapshots(local, remote);
    expect(merged.user[0].updatedAt).toBe(9);
    expect(merged.songs[0].updatedAt).toBe(2);
    expect(merged.songbooks.map((b) => b.id)).toEqual(['b']);
  });
});
