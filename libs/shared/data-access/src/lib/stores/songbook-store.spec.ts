import { TestBed } from '@angular/core/testing';
import type { Songbook } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import { SONGBOOK_REPOSITORY, songbookPagingConfig } from './repositories';
import { SongbookStore } from './songbook-store';

function songbook(id: string, over: Partial<Songbook> = {}): Songbook {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: id,
    title: '',
    subtitle: '',
    author: '',
    settings: {},
    entries: [],
    ...over,
  };
}

function storeWith(seed: Songbook[]): InstanceType<typeof SongbookStore> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SONGBOOK_REPOSITORY,
        useValue: new PagedRepository(
          new MemoryEntitySource<Songbook>(seed),
          songbookPagingConfig,
        ),
      },
    ],
  });
  return TestBed.inject(SongbookStore);
}

describe('SongbookStore', () => {
  it('loads songbooks sorted by name', async () => {
    const store = storeWith([
      songbook('b', { name: 'Set B' }),
      songbook('a', { name: 'Set A' }),
    ]);
    await store.load();

    expect(store.entities().map((b) => b.name)).toEqual(['Set A', 'Set B']);
  });

  it('searches title-page metadata', async () => {
    const store = storeWith([
      songbook('a', { name: 'Set A', author: 'Lennon' }),
      songbook('b', { name: 'Set B', author: 'Bowie' }),
    ]);
    await store.load();
    await store.setSearch('bowie');

    expect(store.entities().map((b) => b.id)).toEqual(['b']);
  });

  it('refresh puts a locally renamed songbook back in sorted order', async () => {
    const store = storeWith([
      songbook('a', { name: 'Set A' }),
      songbook('b', { name: 'Set B' }),
    ]);
    await store.load();
    const renamed = { ...songbook('b'), name: 'Aardvark set' };
    await store.upsert(renamed);

    // `upsert` reflects the write but cannot place it — the map keeps insertion
    // order, so the renamed book still sits second until the query is re-asked.
    expect(store.live().map((b) => b.id)).toEqual(['a', 'b']);
    await store.refresh();
    expect(store.live().map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('refresh keeps tombstones in the map for sync', async () => {
    const store = storeWith([songbook('a'), songbook('b')]);
    await store.load();
    await store.remove('b');
    await store.refresh();

    expect(store.live().map((b) => b.id)).toEqual(['a']);
    expect(
      store
        .entities()
        .map((b) => b.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('reads one songbook by id, for a deep link past the window', async () => {
    const store = storeWith([songbook('a'), songbook('b')]);

    // Never loaded: /songbooks/:id cannot assume the window holds the row.
    expect((await store.byId('b'))?.id).toBe('b');
    expect(store.entities()).toHaveLength(0);
  });
});
