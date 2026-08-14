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
import { LibraryOwnership } from './library-ownership';
import { PAGE_LIMIT, SONG_REPOSITORY } from './repositories';

/**
 * The per-query view state around the entity map. The `withEntities` map is the
 * **growing windowed cache** (§3): each fetched page appends into it and that map
 * is what the list renders. `nextCursor === null` once the window reaches the end.
 */
interface SongQueryState {
  sort: SortKey;
  dir: SortDir | undefined; // undefined = the sort key's natural default
  /** Float starred songs above the rest, within whatever sort is showing. */
  favoritesFirst: boolean;
  query: string;
  loading: boolean;
  nextCursor: Cursor | null;
  loaded: boolean; // first page has resolved at least once
}

const initialState: SongQueryState = {
  sort: 'name',
  dir: undefined,
  favoritesFirst: false,
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
  //
  // Ownership gate on top of it: a library this session does not own (signed out,
  // or signed in as another account) is hidden wholesale — `live` goes empty and
  // every list that binds to it clears, without touching a stored row.
  withComputed((store) => {
    const ownership = inject(LibraryOwnership);
    return {
      live: computed(() =>
        ownership.isVisible()
          ? store.entities().filter((s) => s.deletedAt === null)
          : [],
      ),
    };
  }),
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

    /**
     * Put `loading` down — **the newest fetch's job, and nobody else's.**
     *
     * This is the other half of the stamp, and it is what kept the infinite list
     * from being infinite. A superseded fetch used to bail on `isStale` and
     * simply return, on the reasoning that the newer one owns the flag; but
     * `refresh` claimed a stamp without ever touching `loading`, so a scroll that
     * was overtaken by a favourite, a rename or an import left the flag raised
     * with nothing left to lower it. `loadMore` no-ops while `loading`, so from
     * that moment on the list would not grow again for the rest of the session —
     * and the gesture that broke it (star a row while the next page is in flight)
     * is one nobody would connect to a list that stopped loading.
     *
     * Called from a `finally`, so it also covers the case the stamp never
     * addressed: a page read that **throws**. A failed fetch that leaves the flag
     * raised is the same dead list by another route.
     */
    const settle = (seq: number): void => {
      if (!isStale(seq)) {
        patchState(store, { loading: false });
      }
    };

    // Reset the window and refetch page 1. Every sort/search change funnels here
    // so the cache never mixes rows from two different queries (§4).
    async function reload(): Promise<void> {
      const seq = claim();
      patchState(store, { loading: true });
      try {
        const page = await repo.page({
          limit: PAGE_LIMIT,
          sort: store.sort(),
          dir: store.dir(),
          favoritesFirst: store.favoritesFirst(),
          query: store.query(),
        });
        if (isStale(seq)) {
          return; // a newer fetch owns the window (and `loading`) now
        }
        patchState(store, setAllEntities(page.rows), {
          nextCursor: page.nextCursor,
          loaded: true,
        });
      } finally {
        settle(seq);
      }
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
        try {
          const page = await repo.page({
            limit: PAGE_LIMIT,
            sort: store.sort(),
            dir: store.dir(),
            favoritesFirst: store.favoritesFirst(),
            query: store.query(),
            cursor: store.nextCursor(),
          });
          if (isStale(seq)) {
            return; // the query changed under us; this page belongs to the old one
          }
          patchState(store, setEntities(page.rows), {
            nextCursor: page.nextCursor,
          });
        } finally {
          settle(seq);
        }
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
       *
       * It raises `loading` like any other fetch. It is a re-query of the whole
       * window, so a `loadMore` starting underneath it would be paging against a
       * cursor this call is about to redraw — and, more plainly, whatever holds
       * the flag has to be the thing that puts it down (see `settle`).
       */
      async refresh(): Promise<void> {
        if (!store.loaded()) {
          return;
        }
        const seq = claim();
        patchState(store, { loading: true });
        try {
          const page = await repo.page({
            limit: Math.max(PAGE_LIMIT, store.live().length),
            sort: store.sort(),
            dir: store.dir(),
            favoritesFirst: store.favoritesFirst(),
            query: store.query(),
          });
          if (isStale(seq)) {
            return;
          }
          // The fresh query is authoritative for every id it returns. A tombstone
          // still in the map for one of those ids is stale — the row was revived
          // (an import that replaces a soft-deleted song writes it back live), and
          // re-appending the old tombstone would let `setAllEntities` place it
          // last and win by id, so a replaced song came back looking deleted.
          const liveIds = new Set(page.rows.map((song) => song.id));
          const tombstones = store
            .entities()
            .filter((song) => song.deletedAt !== null && !liveIds.has(song.id));
          patchState(store, setAllEntities([...page.rows, ...tombstones]), {
            nextCursor: page.nextCursor,
          });
        } finally {
          settle(seq);
        }
      },

      /** Change the sort axis (and optional direction) — resets and refetches. */
      async setSort(sort: SortKey, dir?: SortDir): Promise<void> {
        patchState(store, { sort, dir });
        await reload();
      },

      /** Float favourites to the top (or stop) — resets and refetches. */
      async setFavoritesFirst(favoritesFirst: boolean): Promise<void> {
        patchState(store, { favoritesFirst });
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

      /**
       * Every live Song, name-sorted — the entry list of the virtual **All
       * songs** songbook (CONTEXT.md §Songbook).
       *
       * Past the window on purpose, like `lastChanged`: "All songs" means the
       * whole library, not the page of it the explorer has scrolled to. The
       * result is a snapshot for one screen, never written into the window — it
       * answers a different query from the one the list is showing.
       */
      async allLive(order?: {
        sort?: SortKey;
        dir?: SortDir;
        favoritesFirst?: boolean;
      }): Promise<Song[]> {
        const page = await repo.page({
          limit: Number.MAX_SAFE_INTEGER,
          sort: order?.sort ?? 'name',
          dir: order?.dir,
          favoritesFirst: order?.favoritesFirst,
        });
        return page.rows;
      },

      /**
       * One song by id, from the repository — for `/songs/:id/edit`, which is a
       * deep link and cannot assume the window has ever held the row. Not put
       * into the window: opening a song is not a claim that it belongs in the
       * list the user is looking at.
       */
      byId(id: Uuid): Promise<Song | undefined> {
        return repo.get(id);
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
