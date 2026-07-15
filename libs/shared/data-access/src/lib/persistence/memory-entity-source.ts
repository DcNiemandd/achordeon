// In-memory EntitySource — Epic 4 ▸ subtask 2
// Spec: PRD-INFRASTRUCTURE.md §4 ("v1 backing can be mocked ... the component never knows")

import type { BaseRecord, Uuid } from '@achordeon/shared/domain';
import type { EntitySource } from './entity-source';

/**
 * A RAM-backed `EntitySource` — the mockable v1 backing and the test double. Same
 * interface as `DexieEntitySource`, so a store wired to either can't tell the
 * difference. Clones on write and read so callers can't mutate stored records by
 * reference (mirrors IndexedDB's structured-clone boundary).
 */
export class MemoryEntitySource<
  T extends BaseRecord,
> implements EntitySource<T> {
  private readonly rows = new Map<Uuid, T>();

  constructor(seed: readonly T[] = []) {
    for (const record of seed) {
      this.rows.set(record.id, structuredClone(record));
    }
  }

  async all(): Promise<T[]> {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }

  async get(id: Uuid): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : undefined;
  }

  async put(record: T): Promise<void> {
    this.rows.set(record.id, structuredClone(record));
  }

  async bulkPut(records: T[]): Promise<void> {
    for (const record of records) {
      this.rows.set(record.id, structuredClone(record));
    }
  }

  async softDelete(id: Uuid, at: number): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      // Patch in place (preserve-unknown): only the tombstone columns change.
      this.rows.set(id, { ...row, deletedAt: at, updatedAt: at });
    }
  }
}
