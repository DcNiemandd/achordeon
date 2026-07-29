import type { Song, Songbook, User } from '@achordeon/shared/domain';
import {
  profileToUser,
  rowToSong,
  rowToSongbook,
  songToRow,
  songbookEntryRows,
  songbookToRow,
  userToProfilePatch,
  type ProfileRow,
} from './supabase-mapping';

function song(over: Partial<Song> = {}): Song {
  return {
    id: 's1',
    createdAt: 10,
    updatedAt: 20,
    deletedAt: null,
    name: 'Song',
    content: '* Title\nlyric',
    favorite: true,
    settings: { columns: 2 },
    cache: { title: 'Title', subtitle: '' },
    ...over,
  };
}

function songbook(over: Partial<Songbook> = {}): Songbook {
  return {
    id: 'b1',
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
    name: 'Book',
    title: 'T',
    subtitle: 'S',
    author: 'A',
    settings: { columns: 1 },
    entries: ['s1', 's2', 's1'],
    ...over,
  };
}

describe('song row mapping', () => {
  it('round-trips a song through the row shape', () => {
    expect(rowToSong(songToRow(song()))).toEqual(song());
  });

  it('carries the tombstone', () => {
    const dead = song({ deletedAt: 99 });
    expect(songToRow(dead).deleted_at).toBe(99);
    expect(rowToSong(songToRow(dead)).deletedAt).toBe(99);
  });
});

describe('songbook row mapping', () => {
  it('flattens entries into positioned rows, preserving repeats and order', () => {
    expect(songbookEntryRows(songbook())).toEqual([
      { songbook_id: 'b1', song_id: 's1', position: 0 },
      { songbook_id: 'b1', song_id: 's2', position: 1 },
      { songbook_id: 'b1', song_id: 's1', position: 2 },
    ]);
  });

  it('folds unordered join rows back into the entry order', () => {
    const book = songbook();
    const shuffled = [...songbookEntryRows(book)].reverse();
    // Join rows from another songbook must not leak in.
    const foreign = { songbook_id: 'other', song_id: 'x', position: 0 };
    const back = rowToSongbook(songbookToRow(book), [...shuffled, foreign]);
    expect(back).toEqual(book);
  });

  // The book-bound print settings travel with the book, so they have to survive
  // the trip like any other field on the row.
  it('carries the book-bound print settings both ways', () => {
    const book = songbook({
      print: {
        hasTitlePage: false,
        titlePageVariant: 'classic',
        hasSummary: true,
        summaryNumberPlace: 'before',
        hasPageNumbers: true,
        pageNumberPosition: 'before-title',
      },
    });
    expect(songbookToRow(book).print).toEqual(book.print);
    expect(rowToSongbook(songbookToRow(book), songbookEntryRows(book))).toEqual(
      book,
    );
  });

  // "Never said" and "chose the standard layout" are different facts: an absent
  // value maps to null on the row and back to undefined, so it resolves to the
  // default at use rather than winning an LWW merge as somebody's choice.
  it('leaves unset print settings unset rather than inventing a default', () => {
    expect(songbookToRow(songbook()).print).toBeNull();
    expect(rowToSongbook(songbookToRow(songbook()), []).print).toBeUndefined();
  });
});

describe('profile ⇄ user mapping', () => {
  const user: User = {
    id: 'u-local',
    createdAt: 5,
    updatedAt: 6,
    deletedAt: null,
    username: 'me',
    planCache: 'free',
    settings: {} as User['settings'],
  };

  it('keeps the local record id so a pull round-trips the user', () => {
    const patch = userToProfilePatch(user);
    const row: ProfileRow = { id: 'auth-uid', plan: 'pro', ...patch };
    const back = profileToUser(row);
    expect(back?.id).toBe('u-local');
    expect(back?.planCache).toBe('pro'); // plan mirrors into planCache
  });

  it('returns null for a profile never pushed (no record_id)', () => {
    const row: ProfileRow = {
      id: 'auth-uid',
      plan: 'free',
      record_id: null,
      username: '',
      settings: {} as User['settings'],
      all_songs_order: null,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
    };
    expect(profileToUser(row)).toBeNull();
  });

  // The All songs order is the one preference whose whole point is that the other
  // device agrees, so it has to survive the trip. The column grants are per-column
  // on `profiles`, which is where this silently breaks (see the migration).
  it('carries the All songs order both ways', () => {
    const ordered: User = {
      ...user,
      allSongsOrder: { sort: 'created', dir: 'desc', favoritesFirst: true },
    };
    const patch = userToProfilePatch(ordered);
    expect(patch.all_songs_order).toEqual({
      sort: 'created',
      dir: 'desc',
      favoritesFirst: true,
    });

    const back = profileToUser({ id: 'auth-uid', plan: 'free', ...patch });
    expect(back?.allSongsOrder).toEqual(ordered.allSongsOrder);
  });

  // "Never said" and "chose alphabetical" are different facts. Only the first may
  // be overwritten by a device that has an opinion, so an absent order must stay
  // absent rather than resolving to a default that would then win an LWW merge.
  it('leaves an unset order unset rather than inventing a default', () => {
    const patch = userToProfilePatch(user);
    expect(patch.all_songs_order).toBeNull();

    const back = profileToUser({ id: 'auth-uid', plan: 'free', ...patch });
    expect(back?.allSongsOrder).toBeUndefined();
  });
});
