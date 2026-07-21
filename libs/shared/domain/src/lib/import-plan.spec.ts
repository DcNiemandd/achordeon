import { applyImport, datePrefix, planImport } from './import-plan';
import type { Song, Songbook } from './entities';
import type { SnapshotData } from './snapshot';

const NOW = Date.UTC(2026, 6, 21, 10, 0, 0);

const song = (over: Partial<Song> = {}): Song => ({
  id: 'song-1',
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
  name: 'Alpha',
  content: '* Alpha',
  favorite: false,
  settings: {},
  cache: { title: 'Alpha', subtitle: '' },
  ...over,
});

const book = (over: Partial<Songbook> = {}): Songbook => ({
  id: 'book-1',
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
  name: 'Set list',
  title: '',
  subtitle: '',
  author: '',
  settings: {},
  entries: ['song-1'],
  ...over,
});

const data = (over: Partial<SnapshotData> = {}): SnapshotData => ({
  user: [],
  songs: [song()],
  songbooks: [],
  ...over,
});

/** Ids in the order they are handed out, so a test can name what it expects. */
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

const choices = (over: Partial<Parameters<typeof applyImport>[1]> = {}) => ({
  resolution: 'replace' as const,
  now: NOW,
  newId: ids(),
  ...over,
});

describe('planImport', () => {
  it('reports a conflict with both names, because only the pair is answerable', () => {
    const plan = planImport(data(), [song({ name: 'Alpha (mine)' })]);
    expect(plan.conflicts).toEqual([
      { id: 'song-1', incomingName: 'Alpha', existingName: 'Alpha (mine)' },
    ]);
  });

  it('sees no conflict when the ids differ', () => {
    expect(planImport(data(), [song({ id: 'other' })]).conflicts).toEqual([]);
  });

  it('drops incoming tombstones — an import hands you songs, it does not delete', () => {
    const plan = planImport(
      data({
        songs: [song(), song({ id: 'dead', deletedAt: NOW })],
        songbooks: [book({ id: 'dead-book', deletedAt: NOW })],
      }),
      [],
    );
    expect(plan.songs.map((s) => s.id)).toEqual(['song-1']);
    expect(plan.songbooks).toEqual([]);
  });
});

describe('applyImport — songs', () => {
  it('writes a song that does not collide under its own id', () => {
    const write = applyImport(planImport(data(), []), choices());
    expect(write.songs).toHaveLength(1);
    expect(write.songs[0].id).toBe('song-1');
    expect(write.songs[0].createdAt).toBe(1); // not a copy: same birthday
    expect(write.songs[0].updatedAt).toBe(NOW);
  });

  it('replace overwrites the local record in place', () => {
    const write = applyImport(
      planImport(data(), [song({ name: 'mine' })]),
      choices({ resolution: 'replace' }),
    );
    expect(write.songs[0]).toMatchObject({ id: 'song-1', name: 'Alpha' });
  });

  it('ignore writes nothing and says so', () => {
    const write = applyImport(
      planImport(data(), [song({ name: 'mine' })]),
      choices({ resolution: 'ignore' }),
    );
    expect(write.songs).toEqual([]);
    expect(write.ignored).toBe(1);
  });

  it('new lands a copy beside the original', () => {
    const write = applyImport(
      planImport(data(), [song({ name: 'mine' })]),
      choices({ resolution: 'new' }),
    );
    expect(write.songs[0]).toMatchObject({ id: 'new-1', name: 'Alpha' });
    expect(write.songs[0].createdAt).toBe(NOW); // a copy is born today
  });

  it('a resolution touches only the songs that actually collide', () => {
    const write = applyImport(
      planImport(
        data({ songs: [song(), song({ id: 'song-2', name: 'Beta' })] }),
        [song()],
      ),
      choices({ resolution: 'new' }),
    );
    expect(write.songs.map((s) => s.id)).toEqual(['new-1', 'song-2']);
  });

  it('all-as-new copies everything and dates the names, collision or not', () => {
    const write = applyImport(
      planImport(data({ songs: [song(), song({ id: 'song-2' })] }), []),
      choices({ isAllNew: true, resolution: 'ignore' }),
    );
    expect(write.songs.map((s) => s.id)).toEqual(['new-1', 'new-2']);
    expect(write.songs.map((s) => s.name)).toEqual([
      '2026-07-21 Alpha',
      '2026-07-21 Alpha',
    ]);
    expect(datePrefix(NOW)).toBe('2026-07-21');
  });
});

describe('applyImport — songbooks', () => {
  it('always creates a new songbook, never replaces one', () => {
    const incoming = data({ songbooks: [book()] });
    const write = applyImport(planImport(incoming, [book() as never]), {
      ...choices(),
    });
    expect(write.songbooks[0].id).toBe('new-1');
    expect(write.songbooks[0].createdAt).toBe(NOW);
  });

  it('re-points entries at the copies when the songs came in as new', () => {
    // The whole reason songbooks are remapped: a book that kept the old id would
    // quietly fill up with the LOCAL songs it was never about.
    const write = applyImport(
      planImport(data({ songbooks: [book()] }), [song({ name: 'mine' })]),
      choices({ resolution: 'new' }),
    );
    expect(write.songbooks[0].entries).toEqual(['new-1']);
    expect(write.songs[0].id).toBe('new-1');
  });

  it('leaves an ignored song’s slot pointing at the local record', () => {
    const write = applyImport(
      planImport(data({ songbooks: [book()] }), [song({ name: 'mine' })]),
      choices({ resolution: 'ignore' }),
    );
    expect(write.songbooks[0].entries).toEqual(['song-1']);
  });

  it('keeps a slot the file omits but the library already holds', () => {
    const write = applyImport(
      planImport(
        data({ songs: [], songbooks: [book({ entries: ['local-only'] })] }),
        [song({ id: 'local-only' })],
      ),
      choices(),
    );
    expect(write.songbooks[0].entries).toEqual(['local-only']);
  });

  it('drops a slot nothing anywhere can fill', () => {
    const write = applyImport(
      planImport(
        data({ songs: [], songbooks: [book({ entries: ['ghost'] })] }),
        [],
      ),
      choices(),
    );
    expect(write.songbooks[0].entries).toEqual([]);
  });

  it('keeps a repeated slot repeated — the same song may fill several', () => {
    const write = applyImport(
      planImport(
        data({ songbooks: [book({ entries: ['song-1', 'song-1'] })] }),
        [],
      ),
      choices(),
    );
    expect(write.songbooks[0].entries).toEqual(['song-1', 'song-1']);
  });
});
