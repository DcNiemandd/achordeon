// Paged repository — Epic 4 ▸ subtask 2
// Spec: PRD-INFRASTRUCTURE.md §4 (paged/cursor interface over any backing)

import type { BaseRecord, Uuid } from '@achordeon/shared/domain';
import type { EntitySource } from './entity-source';
import {
  type Page,
  type PageQuery,
  type PagingConfig,
  pageRecords,
} from './paging';

/**
 * The paged/cursor interface the frontend codes against, sitting over any
 * `EntitySource` (Memory now, Dexie next) with an entity-specific `PagingConfig`.
 * `page()` is the seam from PRD-INFRASTRUCTURE §4: v1 loads all rows and slices
 * (via `pageRecords`); a later backing can serve the same signature from a keyset
 * query with no caller change. The write/read pass-throughs let the stores upsert
 * and soft-delete without reaching past this boundary to the raw table.
 */
export class PagedRepository<T extends BaseRecord> {
  constructor(
    private readonly source: EntitySource<T>,
    private readonly config: PagingConfig<T>,
  ) {}

  async page(query: PageQuery): Promise<Page<T>> {
    return pageRecords(await this.source.all(), query, this.config);
  }

  get(id: Uuid): Promise<T | undefined> {
    return this.source.get(id);
  }

  put(record: T): Promise<void> {
    return this.source.put(record);
  }

  bulkPut(records: T[]): Promise<void> {
    return this.source.bulkPut(records);
  }

  softDelete(id: Uuid, at: number): Promise<void> {
    return this.source.softDelete(id, at);
  }

  /** Every row incl. tombstones — the snapshot/sync view, not a list view. */
  all(): Promise<T[]> {
    return this.source.all();
  }
}
