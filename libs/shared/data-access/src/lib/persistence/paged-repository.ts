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

  /**
   * Be told when a row has landed in IndexedDB through this repository — the
   * write choke point every UI edit and every import passes through, whether it
   * came via a store or straight from the transfer path.
   *
   * The sync layer's cue to recount "unsynced" (ADR-0004): the flag then matches
   * the database the moment a save commits, not only when a sync cycle happens to
   * run — so the Settings status and the leave-the-page warning stop lying about
   * a rename or a favourite that no push has yet carried. It is a listener, not a
   * call into SyncService, so persistence still knows nothing of sync — same one-
   * way shape as `SettingsStore.onSaved`. Returns an unsubscribe.
   *
   * Not fired by SyncService's own pull-apply: that writes the Dexie table
   * directly, past this boundary, so reflecting the cloud in never counts as a
   * fresh local change.
   */
  onSaved(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly listeners = new Set<() => void>();

  private notifySaved(): void {
    for (const listener of this.listeners) listener();
  }

  async page(query: PageQuery): Promise<Page<T>> {
    return pageRecords(await this.source.all(), query, this.config);
  }

  get(id: Uuid): Promise<T | undefined> {
    return this.source.get(id);
  }

  async put(record: T): Promise<void> {
    await this.source.put(record);
    this.notifySaved();
  }

  async bulkPut(records: T[]): Promise<void> {
    await this.source.bulkPut(records);
    this.notifySaved();
  }

  async softDelete(id: Uuid, at: number): Promise<void> {
    await this.source.softDelete(id, at);
    this.notifySaved();
  }

  /** Every row incl. tombstones — the snapshot/sync view, not a list view. */
  all(): Promise<T[]> {
    return this.source.all();
  }
}
