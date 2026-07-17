// Song entity store — Epic 4 ▸ subtask 3
// Spec: PRD-INFRASTRUCTURE.md §3 (NgRx SignalStore + withEntities; growing windowed cache)

import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  setAllEntities,
  setEntities,
  setEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import type { Song, Uuid } from '@achordeon/shared/domain';
import type { Cursor, SortDir, SortKey } from '../persistence/paging';
import { PAGE_LIMIT, SONG_REPOSITORY } from './repositories';

/**
 * The per-query view state around the entity map. The `withEntities` map is the
 * **growing windowed cache** (§3): each fetched page appends into it and that map
 * is what the list renders. `nextCursor === null` once the window reaches the end.
 */
interface SongQueryState {
  sort: SortKey;
  dir: SortDir | undefined; // undefined = the sort key's natural default
  query: string;
  loading: boolean;
  nextCursor: Cursor | null;
  loaded: boolean; // first page has resolved at least once
}

const initialState: SongQueryState = {
  sort: 'name',
  dir: undefined,
  query: '',
  loading: false,
  nextCursor: null,
  loaded: false,
};

export const SongStore = signalStore(
  { providedIn: 'root' },
  withEntities<Song>(),
  withState<SongQueryState>(initialState),
  // Soft-delete filter (§3): tombstoned rows stay in the entity map so sync still
  // carries the delete, but lists bind to `live` and never show them. A row
  // soft-deleted mid-session drops out here without a refetch.
  withComputed((store) => ({
    live: computed(() => store.entities().filter((s) => s.deletedAt === null)),
  })),
  withMethods((store) => {
    const repo = inject(SONG_REPOSITORY);

    /**
     * Fetches are stamped, and one that resolves after a newer one started is
     * dropped.
     *
     * Every fetch here is an `await` that ends by replacing the window, so
     * without a stamp the **last to resolve wins rather than the latest to be
     * asked** — and those are not the same fetch. Two in flight is the normal
     * case, not an exotic one: typing in the search box, or creating a song and
     * immediately renaming it, each queue a second query while the first is still
     * reading IndexedDB. When the older one landed last it wrote an answer to a
     * question nobody was asking any more — the newly created song simply
     * vanished from the list until a reload.
     */
    let fetchSeq = 0;
    const claim = (): number => ++fetchSeq;
    const isStale = (seq: number): boolean => seq !== fetchSeq;

    // Reset the window and refetch page 1. Every sort/search change funnels here
    // so the cache never mixes rows from two different queries (§4).
    async function reload(): Promise<void> {
      const seq = claim();
      patchState(store, { loading: true });
      const page = await repo.page({
        limit: PAGE_LIMIT,
        sort: store.sort(),
        dir: store.dir(),
        query: store.query(),
      });
      if (isStale(seq)) {
        return; // a newer fetch owns the window (and `loading`) now
      }
      patchState(store, setAllEntities(page.rows), {
        nextCursor: page.nextCursor,
        loading: false,
        loaded: true,
      });
    }

    return {
      /** Load (or reload) the first page for the current query. */
      load(): Promise<void> {
        return reload();
      },

      /** Append the next page into the window; no-op while loading or exhausted. */
      async loadMore(): Promise<void> {
        if (store.loading() || store.nextCursor() === null) {
          return;
        }
        const seq = claim();
        patchState(store, { loading: true });
        const page = await repo.page({
          limit: PAGE_LIMIT,
          sort: store.sort(),
          dir: store.dir(),
          query: store.query(),
          cursor: store.nextCursor(),
        });
        if (isStale(seq)) {
          return; // the query changed under us; this page belongs to the old one
        }
        patchState(store, setEntities(page.rows), {
          nextCursor: page.nextCursor,
          loading: false,
        });
      },

      /**
       * Re-run the current query over the window's current extent.
       *
       * `upsert` reflects a write into the map but **cannot place it**: the map
       * keeps insertion order, so a locally renamed song holds its old slot under
       * a name sort, a favorited one ignores a favorite sort, and a new one lands
       * at the bottom whatever the sort says. The window is a prefix of a sorted
       * query result, so the only honest way to restore it is to ask the query
       * again — filtering or re-sorting in a presenter would be a second, drifting
       * copy of the rules `pageRecords` already owns.
       *
       * Keeps the extent the user scrolled to rather than snapping back to page 1,
       * and keeps tombstones in the map (they are invisible to `live`, and sync
       * still needs them).
       */
      async refresh(): Promise<void> {
        if (!store.loaded()) {
          return;
        }
        const seq = claim();
        const page = await repo.page({
          limit: Math.max(PAGE_LIMIT, store.live().length),
          sort: store.sort(),
          dir: store.dir(),
          query: store.query(),
        });
        if (isStale(seq)) {
          return;
        }
        const tombstones = store
          .entities()
          .filter((song) => song.deletedAt !== null);
        patchState(store, setAllEntities([...page.rows, ...tombstones]), {
          nextCursor: page.nextCursor,
        });
      },

      /** Change the sort axis (and optional direction) — resets and refetches. */
      async setSort(sort: SortKey, dir?: SortDir): Promise<void> {
        patchState(store, { sort, dir });
        await reload();
      },

      /** Set the search text — resets and refetches from page 1. */
      async setSearch(query: string): Promise<void> {
        patchState(store, { query });
        await reload();
      },

      /**
       * The single most recently updated live Song, or `undefined` on an empty
       * library — what `/songs` auto-selects on entry (PRD-UI-SHELL.md §4).
       *
       * **Not `live()[0]`.** The entity map is a growing windowed cache sorted by
       * whatever the explorer is showing (`name` by default), so the most recently
       * updated song may not be in it at all. This is a real query, run past the
       * window and without disturbing it — asking the repository directly would put
       * the same knowledge in a presenter, one layer too high.
       */
      async lastChanged(): Promise<Song | undefined> {
        const page = await repo.page({
          limit: 1,
          sort: 'changed',
          dir: 'desc',
        });
        return page.rows[0];
      },

      /** Persist an add/edit and reflect it in the window immediately. */
      async upsert(song: Song): Promise<void> {
        await repo.put(song);
        patchState(store, setEntity(song));
      },

      /** Soft-delete: tombstone the row (kept in the map for sync; hidden from `live`). */
      async remove(id: Uuid): Promise<void> {
        const at = Date.now();
        await repo.softDelete(id, at);
        patchState(
          store,
          updateEntity({ id, changes: { deletedAt: at, updatedAt: at } }),
        );
      },
    };
  }),
);
