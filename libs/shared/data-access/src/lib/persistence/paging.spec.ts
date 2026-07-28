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
    key === 'name' ? s.name : key === 'created' ? s.createdAt : s.updatedAt,
  isFavorite: (s) => s.favorite,
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

  // A flag OVER the sort, not an axis: both groups keep the chosen order.
  it('floats favorites above the sort without disturbing it', () => {
    const rows = [
      song('a', { name: 'Alpha', favorite: false }),
      song('b', { name: 'Bravo', favorite: true }),
      song('c', { name: 'Charlie', favorite: false }),
      song('d', { name: 'Delta', favorite: true }),
    ];
    const page = pageRecords(
      rows,
      { limit: 10, sort: 'name', favoritesFirst: true },
      config,
    );
    expect(page.rows.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('leaves the order alone when favorites-first is off', () => {
    const rows = [
      song('a', { name: 'Alpha', favorite: false }),
      song('b', { name: 'Bravo', favorite: true }),
    ];
    expect(
      pageRecords(rows, { limit: 10, sort: 'name' }, config).rows.map(
        (s) => s.id,
      ),
    ).toEqual(['a', 'b']);
  });

  // A songbook has no favourite flag, so the request is simply not answerable.
  it('ignores favorites-first for an entity that has no favorites', () => {
    const plain: PagingConfig<Song> = {
      searchTiers: config.searchTiers,
      sortValue: config.sortValue,
    };
    const rows = [
      song('a', { name: 'Alpha', favorite: false }),
      song('b', { name: 'Bravo', favorite: true }),
    ];
    expect(
      pageRecords(
        rows,
        { limit: 10, sort: 'name', favoritesFirst: true },
        plain,
      ).rows.map((s) => s.id),
    ).toEqual(['a', 'b']);
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

  /**
   * The contract the infinite list is built on, stated once over a library big
   * enough for it to matter: following the cursor to exhaustion visits every live
   * row exactly once, in the order the sort promised, and then stops. A gap loses
   * songs the user can never scroll to; a repeat would have the window show the
   * same song twice under two positions.
   */
  it('walks a whole library through the cursor with no gaps and no repeats', () => {
    const rows = Array.from({ length: 137 }, (_, i) =>
      song(`s${String(i).padStart(3, '0')}`),
    );

    const seen: string[] = [];
    let cursor = null as string | null;
    let pages = 0;
    do {
      const page = pageRecords(
        rows,
        { limit: 50, sort: 'name', cursor },
        config,
      );
      seen.push(...page.rows.map((s) => s.id));
      cursor = page.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10); // a cursor that never advances would spin
    } while (cursor !== null);

    expect(seen).toEqual(rows.map((s) => s.id));
    expect(new Set(seen).size).toBe(rows.length);
  });

  /** Tombstones are filtered before the slice, so a page-boundary delete must not
   * take a live row down with it — the deleted rows simply are not in the walk. */
  it('walks past tombstones without dropping the live rows around them', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      song(`s${String(i).padStart(2, '0')}`, {
        deletedAt: i % 3 === 0 ? 99 : null,
      }),
    );

    const seen: string[] = [];
    let cursor = null as string | null;
    do {
      const page = pageRecords(
        rows,
        { limit: 3, sort: 'name', cursor },
        config,
      );
      seen.push(...page.rows.map((s) => s.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toEqual(
      rows.filter((s) => s.deletedAt === null).map((s) => s.id),
    );
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
