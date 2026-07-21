import type { Song } from '@achordeon/shared/domain';
import {
  DEFAULT_SONG_ORDER,
  librarySongOrder,
  type SongOrder,
} from './download-service';

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

const titled = (id: string, title: string, over: Partial<Song> = {}): Song =>
  song({ id, name: 'New song', cache: { title, subtitle: '' }, ...over });

const order = (over: Partial<SongOrder> = {}): SongOrder => ({
  ...DEFAULT_SONG_ORDER,
  ...over,
});

describe('librarySongOrder (All songs print order)', () => {
  it('defaults to the printed title, not the library name', () => {
    // The original bug: every unrenamed song is named "New song", so a name
    // sort left them in insertion order. The default is title.
    const songs = [
      titled('1', 'Zebra'),
      titled('2', 'Apple'),
      titled('3', 'Mango'),
    ];
    expect(librarySongOrder(songs).map((s) => s.cache.title)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('falls back to the library name when a song has no title yet', () => {
    const songs = [
      song({ id: '1', name: 'Beta' }),
      song({ id: '2', name: 'Alpha' }),
    ];
    expect(librarySongOrder(songs).map((s) => s.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('reverses on desc', () => {
    const songs = [titled('1', 'Apple'), titled('2', 'Zebra')];
    expect(
      librarySongOrder(songs, order({ dir: 'desc' })).map((s) => s.cache.title),
    ).toEqual(['Zebra', 'Apple']);
  });

  it('orders by the library name axis', () => {
    const songs = [
      titled('1', 'Apple', { name: 'Second' }),
      titled('2', 'Zebra', { name: 'First' }),
    ];
    expect(
      librarySongOrder(songs, order({ axis: 'name' })).map((s) => s.name),
    ).toEqual(['First', 'Second']);
  });

  it('orders by date created, newest first on desc', () => {
    const songs = [
      titled('old', 'A', { createdAt: 100 }),
      titled('new', 'B', { createdAt: 200 }),
    ];
    expect(
      librarySongOrder(songs, order({ axis: 'created', dir: 'desc' })).map(
        (s) => s.id,
      ),
    ).toEqual(['new', 'old']);
  });

  it('orders by date changed', () => {
    const songs = [
      titled('stale', 'A', { updatedAt: 100 }),
      titled('fresh', 'B', { updatedAt: 300 }),
    ];
    expect(
      librarySongOrder(songs, order({ axis: 'changed', dir: 'desc' })).map(
        (s) => s.id,
      ),
    ).toEqual(['fresh', 'stale']);
  });

  it('floats starred songs first, keeping each group sorted', () => {
    const songs = [
      titled('1', 'Bravo'),
      titled('2', 'Alpha', { favorite: true }),
      titled('3', 'Delta', { favorite: true }),
      titled('4', 'Charlie'),
    ];
    expect(
      librarySongOrder(songs, order({ favoritesFirst: true })).map(
        (s) => s.cache.title,
      ),
    ).toEqual(['Alpha', 'Delta', 'Bravo', 'Charlie']);
  });

  it('breaks a tie by name, so the order is stable', () => {
    const songs = [
      titled('1', 'Same', { name: 'Second' }),
      titled('2', 'Same', { name: 'First' }),
    ];
    expect(librarySongOrder(songs).map((s) => s.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('drops tombstones', () => {
    const songs = [titled('1', 'Live'), titled('2', 'Dead', { deletedAt: 5 })];
    expect(librarySongOrder(songs).map((s) => s.cache.title)).toEqual(['Live']);
  });

  it('does not mutate its input', () => {
    const songs = [titled('1', 'B'), titled('2', 'A')];
    librarySongOrder(songs);
    expect(songs.map((s) => s.cache.title)).toEqual(['B', 'A']);
  });
});
