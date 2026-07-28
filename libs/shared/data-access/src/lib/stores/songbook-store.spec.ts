import { TestBed } from '@angular/core/testing';
import type { Songbook } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import type { Page, PageQuery } from '../persistence/paging';
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

  /**
   * The Song store's stamp, guarded here too — the two stores answer the same
   * shape of question and must not answer it two different ways.
   *
   * A slow re-query overtaken by a search used to land last and win, writing the
   * whole window back over the answer the user had just asked for; and the flag
   * it never lowered would have left a paged list unable to grow again.
   */
  it('drops an overtaken re-query rather than letting it land last', async () => {
    const real = new PagedRepository(
      new MemoryEntitySource<Songbook>([
        songbook('a', { name: 'Set A', author: 'Lennon' }),
        songbook('b', { name: 'Set B', author: 'Bowie' }),
      ]),
      songbookPagingConfig,
    );
    const delaysMs = [0, 30, 0]; // load, the re-query, then the search
    let call = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SONGBOOK_REPOSITORY,
          useValue: {
            page: async (query: PageQuery): Promise<Page<Songbook>> => {
              const delay = delaysMs[call++] ?? 0;
              const page = await real.page(query);
              await new Promise((resolve) => setTimeout(resolve, delay));
              return page;
            },
          } as unknown as PagedRepository<Songbook>,
        },
      ],
    });
    const store = TestBed.inject(SongbookStore);
    await store.load();

    const stale = store.refresh();
    const fresh = store.setSearch('bowie'); // the question actually being asked
    await Promise.all([stale, fresh]);

    expect(store.live().map((b) => b.id)).toEqual(['b']);
    expect(store.loading()).toBe(false);
  });

  it('reads one songbook by id, for a deep link past the window', async () => {
    const store = storeWith([songbook('a'), songbook('b')]);

    // Never loaded: /songbooks/:id cannot assume the window holds the row.
    expect((await store.byId('b'))?.id).toBe('b');
    expect(store.entities()).toHaveLength(0);
  });
});
