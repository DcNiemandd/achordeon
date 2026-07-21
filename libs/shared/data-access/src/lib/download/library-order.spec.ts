import type { Song } from '@achordeon/shared/domain';
import { librarySongOrder } from './download-service';

function song(over: Partial<Song> & { id: string }): Song {
  return {
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: over.id,
    content: '',
    favorite: false,
    settings: {},
    cache: { title: '', subtitle: '' },
    ...over,
  };
}

describe('librarySongOrder (All songs print order)', () => {
  it('orders by the printed title, not the library name', () => {
    // The bug: every unrenamed song is named "New song", so a name sort left
    // them in insertion order. Ordering by title is what a reader expects.
    const songs = [
      song({
        id: '1',
        name: 'New song',
        cache: { title: 'Zebra', subtitle: '' },
      }),
      song({
        id: '2',
        name: 'New song',
        cache: { title: 'Apple', subtitle: '' },
      }),
      song({
        id: '3',
        name: 'New song',
        cache: { title: 'Mango', subtitle: '' },
      }),
    ];
    expect(librarySongOrder(songs).map((s) => s.cache.title)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('falls back to the library name when a song has no title yet', () => {
    const songs = [
      song({ id: '1', name: 'Beta', cache: { title: '', subtitle: '' } }),
      song({ id: '2', name: 'Alpha', cache: { title: '', subtitle: '' } }),
    ];
    expect(librarySongOrder(songs).map((s) => s.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('breaks a title tie by name, so the order is stable', () => {
    const songs = [
      song({ id: '1', name: 'Second', cache: { title: 'Same', subtitle: '' } }),
      song({ id: '2', name: 'First', cache: { title: 'Same', subtitle: '' } }),
    ];
    expect(librarySongOrder(songs).map((s) => s.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('drops tombstones', () => {
    const songs = [
      song({ id: '1', cache: { title: 'Live', subtitle: '' } }),
      song({ id: '2', deletedAt: 5, cache: { title: 'Dead', subtitle: '' } }),
    ];
    expect(librarySongOrder(songs).map((s) => s.cache.title)).toEqual(['Live']);
  });

  it('does not mutate its input', () => {
    const songs = [
      song({ id: '1', cache: { title: 'B', subtitle: '' } }),
      song({ id: '2', cache: { title: 'A', subtitle: '' } }),
    ];
    librarySongOrder(songs);
    expect(songs.map((s) => s.cache.title)).toEqual(['B', 'A']);
  });
});
