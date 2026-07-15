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
});
