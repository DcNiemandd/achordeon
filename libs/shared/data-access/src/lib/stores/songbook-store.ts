// Songbook entity store — Epic 4 ▸ subtask 3
// Spec: PRD-INFRASTRUCTURE.md §3 (same paged windowed-cache pattern as SongStore)

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
import type { Songbook, Uuid } from '@achordeon/shared/domain';
import type { Cursor, SortDir, SortKey } from '../persistence/paging';
import { PAGE_LIMIT, SONGBOOK_REPOSITORY } from './repositories';

interface SongbookQueryState {
  sort: SortKey;
  dir: SortDir | undefined;
  query: string;
  loading: boolean;
  nextCursor: Cursor | null;
  loaded: boolean;
}

const initialState: SongbookQueryState = {
  sort: 'name',
  dir: undefined,
  query: '',
  loading: false,
  nextCursor: null,
  loaded: false,
};

export const SongbookStore = signalStore(
  { providedIn: 'root' },
  withEntities<Songbook>(),
  withState<SongbookQueryState>(initialState),
  // Soft-delete filter (§3): tombstoned rows stay in the map for sync; lists bind
  // to `live`.
  withComputed((store) => ({
    live: computed(() => store.entities().filter((b) => b.deletedAt === null)),
  })),
  withMethods((store) => {
    const repo = inject(SONGBOOK_REPOSITORY);

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
      load(): Promise<void> {
        return reload();
      },

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

      async setSort(sort: SortKey, dir?: SortDir): Promise<void> {
        patchState(store, { sort, dir });
        await reload();
      },

      async setSearch(query: string): Promise<void> {
        patchState(store, { query });
        await reload();
      },

      async upsert(songbook: Songbook): Promise<void> {
        await repo.put(songbook);
        patchState(store, setEntity(songbook));
      },

      /**
       * Every live songbook holding this song — what the "in use" delete warning
       * asks (CONTEXT.md §Delete vs Remove).
       *
       * Asked of the **repository, not the window**: the window holds one page of
       * a name-sorted query, so a songbook the user has not scrolled to would
       * answer "not in use" and the warning would lie about the destruction it is
       * warning about. A tombstoned songbook is not "in use" — it is deleted.
       */
      async songbooksWith(songId: Uuid): Promise<Songbook[]> {
        const all = await repo.all();
        return all.filter(
          (book) => book.deletedAt === null && book.entries.includes(songId),
        );
      },

      /**
       * Drop every slot referencing this song, from every songbook that has one —
       * the cascade half of deleting a Song (CONTEXT.md §Delete vs Remove).
       *
       * The same song may occupy several slots in one songbook, so this filters
       * rather than removing an index. Songbooks whose entries do not change are
       * not rewritten: an `updatedAt` bump is a sync push (ADR-0004), and a
       * songbook that never held the song has not changed.
       */
      async removeSongEverywhere(songId: Uuid): Promise<void> {
        const all = await repo.all();
        const at = Date.now();
        for (const book of all) {
          if (!book.entries.includes(songId)) {
            continue;
          }
          const updated: Songbook = {
            ...book,
            entries: book.entries.filter((entry) => entry !== songId),
            updatedAt: at,
          };
          await repo.put(updated);
          patchState(store, setEntity(updated));
        }
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
