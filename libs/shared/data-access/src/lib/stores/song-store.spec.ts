import { TestBed } from '@angular/core/testing';
import type { Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import type { Page } from '../persistence/paging';
import { PAGE_LIMIT, SONG_REPOSITORY, songPagingConfig } from './repositories';
import { SongStore } from './song-store';

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

function storeWith(seed: Song[]): InstanceType<typeof SongStore> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SONG_REPOSITORY,
        useValue: new PagedRepository(
          new MemoryEntitySource<Song>(seed),
          songPagingConfig,
        ),
      },
    ],
  });
  return TestBed.inject(SongStore);
}

/**
 * A repository whose `page()` calls resolve in a controlled order, so an
 * out-of-order fetch can be reproduced rather than waited for.
 */
function racingRepo(answers: Song[][], delaysMs: number[]) {
  let call = 0;
  return {
    page: async (): Promise<Page<Song>> => {
      const mine = call++;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[mine]));
      return { rows: answers[mine], nextCursor: null };
    },
  } as unknown as PagedRepository<Song>;
}

describe('SongStore', () => {
  it('loads the first page sorted by name', async () => {
    const store = storeWith([
      song('b', { name: 'Bravo' }),
      song('a', { name: 'Alpha' }),
    ]);
    await store.load();

    expect(store.loaded()).toBe(true);
    expect(store.entities().map((s) => s.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('resets and refetches when the search changes', async () => {
    const store = storeWith([
      song('a', {
        name: 'Alpha',
        cache: { title: 'Wonderwall', subtitle: '' },
      }),
      song('b', { name: 'Bravo', cache: { title: 'Yesterday', subtitle: '' } }),
    ]);
    await store.load();
    await store.setSearch('yester');

    expect(store.entities().map((s) => s.id)).toEqual(['b']);
  });

  it('resets and refetches when the sort changes', async () => {
    const store = storeWith([
      song('a', { name: 'Alpha', updatedAt: 10 }),
      song('b', { name: 'Bravo', updatedAt: 20 }),
    ]);
    await store.load();
    await store.setSort('changed'); // newest-first default

    expect(store.entities().map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('persists and reflects an upsert', async () => {
    const store = storeWith([song('a', { name: 'Alpha' })]);
    await store.load();
    await store.upsert(song('z', { name: 'Zeta' }));

    expect(
      store
        .entities()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['a', 'z']);
  });

  it('soft-deletes: hidden from live, kept in the entity map for sync', async () => {
    const store = storeWith([song('a'), song('b')]);
    await store.load();
    await store.remove('a');

    // `live` hides the tombstone...
    expect(store.live().map((s) => s.id)).toEqual(['b']);
    // ...but the row stays in the map (sync must still carry the delete).
    const tombstoned = store.entities().find((s) => s.id === 'a');
    expect(tombstoned?.deletedAt).not.toBeNull();
  });

  it('ignores a fetch that resolves after a newer one started', async () => {
    // The first query is slow and answers 'a'; the second is fast and answers
    // 'b'. Last-to-resolve must NOT win: the user asked for 'b' second, so 'b'
    // is the answer, whatever order IndexedDB happens to reply in.
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SONG_REPOSITORY,
          useValue: racingRepo([[song('a')], [song('b')]], [30, 0]),
        },
      ],
    });
    const store = TestBed.inject(SongStore);

    const slow = store.load();
    const fast = store.setSearch('b');
    await Promise.all([slow, fast]);

    expect(store.live().map((s) => s.id)).toEqual(['b']);
    // The stale fetch must not leave the list stuck in a loading state either.
    expect(store.loading()).toBe(false);
  });

  it('refresh puts a locally renamed song back in sorted order', async () => {
    const store = storeWith([
      song('a', { name: 'Alpha' }),
      song('b', { name: 'Bravo' }),
    ]);
    await store.load();

    // An upsert reflects the write but keeps the map's insertion order, so on
    // its own the renamed song holds Alpha's old slot under a name sort.
    await store.upsert(song('a', { name: 'Zeta' }));
    expect(store.live().map((s) => s.name)).toEqual(['Zeta', 'Bravo']);

    await store.refresh();
    expect(store.live().map((s) => s.name)).toEqual(['Bravo', 'Zeta']);
  });

  it('refresh keeps the scrolled extent rather than snapping back to page 1', async () => {
    const seed = Array.from({ length: PAGE_LIMIT + 5 }, (_, i) =>
      song(`s${String(i).padStart(3, '0')}`),
    );
    const store = storeWith(seed);
    await store.load();
    await store.loadMore();

    await store.refresh();

    expect(store.live()).toHaveLength(PAGE_LIMIT + 5);
    expect(store.nextCursor()).toBeNull();
  });

  it('refresh keeps tombstones in the map for sync', async () => {
    const store = storeWith([song('a'), song('b')]);
    await store.load();
    await store.remove('a');

    await store.refresh();

    expect(store.live().map((s) => s.id)).toEqual(['b']);
    expect(
      store.entities().find((s) => s.id === 'a')?.deletedAt,
    ).not.toBeNull();
  });

  it('searches a song by its name, not only by its parsed title', async () => {
    // A fresh song has no Title yet; if search skipped Name it would be
    // unfindable in its own library.
    const store = storeWith([
      song('a', { name: 'Wonderwall' }),
      song('b', { name: 'Yesterday' }),
    ]);
    await store.load();
    await store.setSearch('wonder');

    expect(store.live().map((s) => s.id)).toEqual(['a']);
  });

  it('answers which song changed last, past the window and past the sort', async () => {
    // The window is name-sorted and only 2 rows wide here; the newest song sorts
    // last by name, so `live()[0]` would answer 'Alpha'. It is not the answer.
    const store = storeWith([
      song('a', { name: 'Alpha', updatedAt: 10 }),
      song('z', { name: 'Zeta', updatedAt: 99 }),
    ]);
    await store.load();

    expect((await store.lastChanged())?.id).toBe('z');
    // ...and asking did not disturb the explorer's window.
    expect(store.entities().map((s) => s.id)).toEqual(['a', 'z']);
  });

  it('has no last-changed song in an empty library', async () => {
    const store = storeWith([]);
    await store.load();

    expect(await store.lastChanged()).toBeUndefined();
  });

  it('never answers a tombstoned song as the last changed', async () => {
    const store = storeWith([
      song('a', { name: 'Alpha', updatedAt: 10 }),
      song('z', { name: 'Zeta', updatedAt: 99 }),
    ]);
    await store.load();
    await store.remove('z');

    expect((await store.lastChanged())?.id).toBe('a');
  });

  it('answers the whole live library, past the window, for All songs', async () => {
    const seed = Array.from({ length: PAGE_LIMIT + 5 }, (_, i) =>
      song(`s${String(i).padStart(3, '0')}`),
    );
    const store = storeWith(seed);
    await store.load();
    await store.remove('s000');

    // The window holds one page; the virtual songbook is the whole library.
    expect(store.entities()).toHaveLength(PAGE_LIMIT);
    const all = await store.allLive();
    expect(all).toHaveLength(PAGE_LIMIT + 4);
    expect(all.some((s) => s.id === 's000')).toBe(false);
  });

  it('appends the next page into the growing window', async () => {
    const seed = Array.from({ length: PAGE_LIMIT + 5 }, (_, i) =>
      song(`s${String(i).padStart(3, '0')}`),
    );
    const store = storeWith(seed);

    await store.load();
    expect(store.entities()).toHaveLength(PAGE_LIMIT);
    expect(store.nextCursor()).not.toBeNull();

    await store.loadMore();
    expect(store.entities()).toHaveLength(PAGE_LIMIT + 5);
    expect(store.nextCursor()).toBeNull();

    // Exhausted window: a further loadMore is a no-op.
    await store.loadMore();
    expect(store.entities()).toHaveLength(PAGE_LIMIT + 5);
  });
});
