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
 * One face of one font the user added (ADR-0016).
 *
 * **A file is a face, not a family**: a family accumulates them as its files are
 * added, which is why the primary key is family + variant rather than a file
 * name. Adding the same face twice replaces it rather than making a second row.
 *
 * A table rather than a blob in `meta`, and that is what puts custom fonts into
 * the whole-database dump (`snapshot-blob.ts`) for free — which is the entire
 * backup and cross-device story for them. They do **not** ride an Export: that
 * carries references, never bytes (PRD-INFRASTRUCTURE.md §8).
 */
export interface FontFaceRow {
  /** `${familyId}|${variant}`. */
  key: string;
  /** The catalog id — `custom:<slug>` of the family's own name (ADR-0017). */
  familyId: string;
  /** The family as the font names itself, for the picker. */
  label: string;
  /** Which of the four faces this file is, read out of the file (ADR-0016). */
  variant: string;
  /**
   * The TTF, base64.
   *
   * Not an `ArrayBuffer`: base64 is the form `emit` and jsPDF both take, so the
   * bytes reach a render with no conversion, and a whole-database dump stays a
   * text document rather than acquiring a binary column.
   */
  bytes: string;
  /** An `fvar` table was found: this supplies its default instance only. */
  isVariable: boolean;
  /** What the file says about its own licence (name ID 13), where it says it. */
  license?: string;
  /** The URL it was fetched from, when it came from one rather than a file. */
  source?: string;
  addedAt: number;
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
  fonts!: Table<FontFaceRow, string>;

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
    // v2 — the font library (ADR-0016). A new *table* is exactly what a physical
    // version bump is for; nothing about any existing row's shape moved, so this
    // is not a logical `schemaVersion` change (ADR-0007). Indexed by family so
    // deleting one is a query rather than a scan.
    this.version(2).stores({ fonts: 'key, familyId' });
  }
}
