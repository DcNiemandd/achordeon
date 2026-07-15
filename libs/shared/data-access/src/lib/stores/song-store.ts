// Song entity store — Epic 4 ▸ subtask 3
// Spec: PRD-INFRASTRUCTURE.md §3 (NgRx SignalStore + withEntities; growing windowed cache)

import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  setAllEntities,
  setEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import type { Song } from '@achordeon/shared/domain';
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
  withMethods((store) => {
    const repo = inject(SONG_REPOSITORY);

    // Reset the window and refetch page 1. Every sort/search change funnels here
    // so the cache never mixes rows from two different queries (§4).
    async function reload(): Promise<void> {
      patchState(store, { loading: true });
      const page = await repo.page({
        limit: PAGE_LIMIT,
        sort: store.sort(),
        dir: store.dir(),
        query: store.query(),
      });
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
        patchState(store, { loading: true });
        const page = await repo.page({
          limit: PAGE_LIMIT,
          sort: store.sort(),
          dir: store.dir(),
          query: store.query(),
          cursor: store.nextCursor(),
        });
        patchState(store, setEntities(page.rows), {
          nextCursor: page.nextCursor,
          loading: false,
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

      /** Persist an add/edit and reflect it in the window immediately. */
      async upsert(song: Song): Promise<void> {
        await repo.put(song);
        patchState(store, setEntity(song));
      },
    };
  }),
);
