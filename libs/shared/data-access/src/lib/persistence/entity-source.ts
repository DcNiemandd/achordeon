// Storage seam for one entity table — Epic 4 ▸ subtask 1
// Spec: PRD-INFRASTRUCTURE.md §1/§4 (soft-delete only), ADR-0007 (preserve-unknown)

import type { BaseRecord, Uuid } from '@achordeon/shared/domain';
import type { Table, UpdateSpec } from 'dexie';

/**
 * The read/write surface a paged repository (subtask 2) and the ingest gateway
 * (subtask 6) sit on top of. One implementation per backing (Dexie now; a mock
 * array in tests). Every method works on **whole records** so unknown fields
 * survive the round-trip (ADR-0007 preserve-unknown).
 *
 * Deletes are ALWAYS soft: there is no method that physically removes a row —
 * nothing is ever hard-deleted, anywhere (PRD-INFRASTRUCTURE.md §1). Tombstoned
 * rows are returned by `all()` (sync must carry them) and filtered out for lists
 * higher up.
 */
export interface EntitySource<T extends BaseRecord> {
  /** Every row, tombstones included — the sync/snapshot view. */
  all(): Promise<T[]>;
  get(id: Uuid): Promise<T | undefined>;
  put(record: T): Promise<void>;
  bulkPut(records: T[]): Promise<void>;
  /** Set the `deletedAt` tombstone in place; the row itself stays. */
  softDelete(id: Uuid, at: number): Promise<void>;
}

/** Dexie-backed `EntitySource` — the real IndexedDB path. */
export class DexieEntitySource<
  T extends BaseRecord,
> implements EntitySource<T> {
  constructor(private readonly table: Table<T, Uuid>) {}

  all(): Promise<T[]> {
    return this.table.toArray();
  }

  get(id: Uuid): Promise<T | undefined> {
    return this.table.get(id);
  }

  async put(record: T): Promise<void> {
    await this.table.put(record);
  }

  async bulkPut(records: T[]): Promise<void> {
    await this.table.bulkPut(records);
  }

  async softDelete(id: Uuid, at: number): Promise<void> {
    // Patch in place (not a rewrite) so unrecognised fields ride along — the
    // tombstone is just two columns changing. `updatedAt` bumps so LWW carries
    // the delete to the cloud like any other edit (ADR-0004).
    const changes = { deletedAt: at, updatedAt: at } as UpdateSpec<T>;
    await this.table.update(id, changes);
  }
}
