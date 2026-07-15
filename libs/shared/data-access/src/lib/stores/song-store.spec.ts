import { TestBed } from '@angular/core/testing';
import type { Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
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
