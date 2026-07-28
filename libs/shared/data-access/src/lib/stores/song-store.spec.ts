import { TestBed } from '@angular/core/testing';
import type { Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import type { Page, PageQuery } from '../persistence/paging';
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

/**
 * A real repository over `seed`, with each successive `page()` held back by its
 * own delay — so "a refresh overtakes the page that is still in flight" can be
 * staged as an ordering rather than hoped for.
 */
function pacedRepo(seed: Song[], delaysMs: number[]): PagedRepository<Song> {
  const real = new PagedRepository(
    new MemoryEntitySource<Song>(seed),
    songPagingConfig,
  );
  let call = 0;
  return {
    page: async (query: PageQuery): Promise<Page<Song>> => {
      const delay = delaysMs[call++] ?? 0;
      const page = await real.page(query);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return page;
    },
    get: (id: string) => real.get(id),
    put: (record: Song) => real.put(record),
    softDelete: (id: string, at: number) => real.softDelete(id, at),
    all: () => real.all(),
  } as unknown as PagedRepository<Song>;
}

/** A library of `count` name-sortable songs. */
function library(count: number): Song[] {
  return Array.from({ length: count }, (_, i) =>
    song(`s${String(i).padStart(3, '0')}`),
  );
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

  /**
   * The window is a **prefix of a sorted query**, so a new sort is a new query:
   * it has to start again at page one, not re-order the pages already in hand.
   *
   * This is what the virtual *All songs* book leans on. Its rows are this very
   * window (there is no record to re-read), so telling that book to sort itself
   * must throw the scrolled extent away and ask again — otherwise the first
   * screenful would be the new order over the old *selection* of songs, which is
   * the wrong fifty rows sorted correctly.
   */
  it('a sort change re-reads from page one, not over the scrolled window', async () => {
    const seed = library(PAGE_LIMIT * 3);
    const store = storeWith(seed);
    await store.load();
    await store.loadMore();
    expect(store.live()).toHaveLength(PAGE_LIMIT * 2);

    await store.setSort('name', 'desc');

    // One page again, and it opens on the library's last name — the window was
    // refetched, not reversed in place.
    expect(store.live()).toHaveLength(PAGE_LIMIT);
    expect(store.live()[0].id).toBe(seed[seed.length - 1].id);
    expect(store.nextCursor()).not.toBeNull();
  });

  /** Favourites-first is a flag over the axis, not an axis of its own — both
   * groups stay ordered by the sort the user chose (CONTEXT.md §Favorite). */
  it('floats favourites over the sort, and re-reads to do it', async () => {
    const store = storeWith([
      song('a', { name: 'Alpha' }),
      song('b', { name: 'Bravo' }),
      song('z', { name: 'Zeta', favorite: true }),
    ]);
    await store.load();
    expect(store.live().map((s) => s.id)).toEqual(['a', 'b', 'z']);

    await store.setFavoritesFirst(true);
    expect(store.live().map((s) => s.id)).toEqual(['z', 'a', 'b']);
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

  it('refresh revives a song the query now returns live, over a stale tombstone', async () => {
    // The import bug: replacing a soft-deleted song writes it back live in the
    // repository, but the store still holds the tombstone. `refresh` must let the
    // fresh live row win — re-appending the stale tombstone let it shadow the
    // revived song by id, so a replaced song came back looking deleted.
    const source = new MemoryEntitySource<Song>([song('a'), song('b')]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SONG_REPOSITORY,
          useValue: new PagedRepository(source, songPagingConfig),
        },
      ],
    });
    const store = TestBed.inject(SongStore);
    await store.load();
    await store.remove('a'); // tombstone, in memory and in the repository

    await source.put(song('a', { name: 'imported' })); // deletedAt: null
    await store.refresh();

    expect(
      store
        .live()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(store.live().find((s) => s.id === 'a')?.name).toBe('imported');
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

  /**
   * The reason the "infinite" list would stop growing mid-session.
   *
   * Starring, renaming or importing while the next page is still being read
   * overtakes it: the scroll's fetch comes back stale and drops its answer, which
   * is right — but it used to leave `loading` raised, and `refresh` never lowered
   * the flag it had just taken ownership of. `loadMore` no-ops while `loading`,
   * so the window was frozen at whatever it had reached, for good.
   */
  it('keeps growing after a refresh overtakes a page in flight', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SONG_REPOSITORY,
          // load fast, the scroll's page slow, the refresh fast — so the refresh
          // lands first and the overtaken page arrives to a window it no longer owns.
          useValue: pacedRepo(library(PAGE_LIMIT * 3), [0, 30, 0]),
        },
      ],
    });
    const store = TestBed.inject(SongStore);
    await store.load();

    const scrolled = store.loadMore();
    const restyled = store.refresh(); // as a favourite or a rename would
    await Promise.all([scrolled, restyled]);

    expect(store.loading()).toBe(false);

    const before = store.live().length;
    await store.loadMore();
    expect(store.live().length).toBeGreaterThan(before);
  });

  /** A page read that throws is a bad moment, not a permanent one: the flag has
   * to come down or the list never asks for another row. */
  it('keeps growing after a page read fails', async () => {
    const seed = library(PAGE_LIMIT * 2);
    const real = new PagedRepository(
      new MemoryEntitySource<Song>(seed),
      songPagingConfig,
    );
    let hasFailed = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SONG_REPOSITORY,
          useValue: {
            page: async (query: PageQuery): Promise<Page<Song>> => {
              if (query.cursor && !hasFailed) {
                hasFailed = true;
                throw new Error('IndexedDB said no');
              }
              return real.page(query);
            },
          } as unknown as PagedRepository<Song>,
        },
      ],
    });
    const store = TestBed.inject(SongStore);
    await store.load();

    await expect(store.loadMore()).rejects.toThrow('IndexedDB said no');
    expect(store.loading()).toBe(false);

    await store.loadMore();
    expect(store.live()).toHaveLength(PAGE_LIMIT * 2);
  });
});
