import type { Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from './memory-entity-source';
import { PagedRepository } from './paged-repository';
import { type PagingConfig, type SortKey, pageRecords } from './paging';

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

const config: PagingConfig<Song> = {
  searchTiers: (s) => [`${s.cache.title} ${s.cache.subtitle}`, s.content],
  sortValue: (s, key: SortKey) =>
    key === 'name'
      ? s.name
      : key === 'created'
        ? s.createdAt
        : key === 'changed'
          ? s.updatedAt
          : s.favorite,
};

describe('pageRecords', () => {
  it('sorts by name ascending by default', () => {
    const rows = [
      song('c', { name: 'Charlie' }),
      song('a', { name: 'Alpha' }),
      song('b', { name: 'Bravo' }),
    ];
    const page = pageRecords(rows, { limit: 10, sort: 'name' }, config);
    expect(page.rows.map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(page.nextCursor).toBeNull();
  });

  it('sorts by created/changed newest-first by default', () => {
    const rows = [
      song('a', { createdAt: 100, updatedAt: 5 }),
      song('b', { createdAt: 200, updatedAt: 9 }),
      song('c', { createdAt: 150, updatedAt: 1 }),
    ];
    expect(
      pageRecords(rows, { limit: 10, sort: 'created' }, config).rows.map(
        (s) => s.id,
      ),
    ).toEqual(['b', 'c', 'a']);
    expect(
      pageRecords(rows, { limit: 10, sort: 'changed' }, config).rows.map(
        (s) => s.id,
      ),
    ).toEqual(['b', 'a', 'c']);
  });

  it('sorts favorites first by default', () => {
    const rows = [
      song('a', { favorite: false }),
      song('b', { favorite: true }),
      song('c', { favorite: false }),
    ];
    expect(
      pageRecords(rows, { limit: 10, sort: 'favorite' }, config).rows[0].id,
    ).toBe('b');
  });

  it('honours an explicit direction override', () => {
    const rows = [song('a', { name: 'Alpha' }), song('b', { name: 'Bravo' })];
    const page = pageRecords(
      rows,
      { limit: 10, sort: 'name', dir: 'desc' },
      config,
    );
    expect(page.rows.map((s) => s.name)).toEqual(['Bravo', 'Alpha']);
  });

  it('excludes tombstoned rows from the page', () => {
    const rows = [song('a'), song('b', { deletedAt: 123 }), song('c')];
    const page = pageRecords(rows, { limit: 10, sort: 'name' }, config);
    expect(page.rows.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('walks pages via the cursor and stops with a null cursor', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => song(id, { name: id }));

    const first = pageRecords(rows, { limit: 2, sort: 'name' }, config);
    expect(first.rows.map((s) => s.id)).toEqual(['a', 'b']);
    expect(first.nextCursor).not.toBeNull();

    const second = pageRecords(
      rows,
      { limit: 2, sort: 'name', cursor: first.nextCursor },
      config,
    );
    expect(second.rows.map((s) => s.id)).toEqual(['c', 'd']);

    const third = pageRecords(
      rows,
      { limit: 2, sort: 'name', cursor: second.nextCursor },
      config,
    );
    expect(third.rows.map((s) => s.id)).toEqual(['e']);
    expect(third.nextCursor).toBeNull();
  });

  it('ranks metadata (Title) matches above content matches', () => {
    const meta = song('meta', { cache: { title: 'Wonderwall', subtitle: '' } });
    const body = song('body', {
      cache: { title: 'Something', subtitle: '' },
      content: 'wonderwall lyric line',
    });
    const page = pageRecords(
      [body, meta],
      { limit: 10, sort: 'name', query: 'wonderwall' },
      config,
    );
    expect(page.rows.map((s) => s.id)).toEqual(['meta', 'body']);
  });

  it('drops rows matching neither tier and searches case-insensitively', () => {
    const rows = [
      song('a', { cache: { title: 'Yesterday', subtitle: '' } }),
      song('b', { cache: { title: 'Let It Be', subtitle: '' } }),
    ];
    const page = pageRecords(
      rows,
      { limit: 10, sort: 'name', query: 'YESTER' },
      config,
    );
    expect(page.rows.map((s) => s.id)).toEqual(['a']);
  });
});

describe('PagedRepository', () => {
  it('pages over an EntitySource and exposes write pass-throughs', async () => {
    const source = new MemoryEntitySource<Song>([
      song('a', { name: 'Alpha' }),
      song('b', { name: 'Bravo' }),
    ]);
    const repo = new PagedRepository(source, config);

    expect(
      (await repo.page({ limit: 10, sort: 'name' })).rows.map((s) => s.name),
    ).toEqual(['Alpha', 'Bravo']);

    await repo.put(song('c', { name: 'Charlie' }));
    await repo.softDelete('a', 42);

    const page = await repo.page({ limit: 10, sort: 'name' });
    expect(page.rows.map((s) => s.name)).toEqual(['Bravo', 'Charlie']); // 'a' tombstoned
    expect((await repo.all()).map((s) => s.id).sort()).toEqual(['a', 'b', 'c']); // all() keeps it
  });
});
