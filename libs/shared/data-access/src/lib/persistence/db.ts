// Dexie tables — Epic 4 ▸ subtask 1
// Spec: PRD-INFRASTRUCTURE.md §4 (Dexie), ADR-0007 (physical vs logical version)

import Dexie, { type Table } from 'dexie';
import type { Song, Songbook, User } from '@achordeon/shared/domain';

/** Default IndexedDB database name. Overridable so tests get isolated instances. */
export const DB_NAME = 'achordeon';

/**
 * A small key/value side table. Holds device-local bookkeeping that must NOT ride
 * in the Snapshot — the logical `schemaVersion` last persisted locally and this
 * install's `deviceId` (feeds per-row LWW, ADR-0004). Never synced.
 */
export interface MetaRow {
  key: string;
  value: string;
}

/**
 * The one place that owns the IndexedDB handle (PRD-INFRASTRUCTURE.md §2:
 * "only thing that touches IndexedDB"). The `.version()` here is the **physical**
 * store/index version (ADR-0007) — bumped only when an index or table changes,
 * never for content-shape changes (those are the logical `schemaVersion`, migrated
 * by the ingest gateway). Additive non-indexed fields ride along for free under
 * structured clone, so most model growth needs no bump here.
 */
export class AchordeonDb extends Dexie {
  user!: Table<User, string>;
  songs!: Table<Song, string>;
  songbooks!: Table<Songbook, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Primary key first, then the columns the paged/sort/search reads key off.
    // `deletedAt` is indexed so list queries can exclude tombstones cheaply once
    // paging moves off the v1 load-all path.
    this.version(1).stores({
      user: 'id, updatedAt, deletedAt',
      songs: 'id, name, favorite, createdAt, updatedAt, deletedAt',
      songbooks: 'id, name, createdAt, updatedAt, deletedAt',
      meta: 'key',
    });
  }
}
