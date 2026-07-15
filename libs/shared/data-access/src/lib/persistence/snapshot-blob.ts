// Whole-DB Snapshot blob — Epic 4 ▸ subtask 7
// Spec: PRD-INFRASTRUCTURE.md §4 (dexie-export-import "produces the Snapshot blob for free")

import { exportDB, importInto } from 'dexie-export-import';
import type { AchordeonDb } from './db';

/**
 * Dump the entire local database to a Blob via dexie-export-import — the low-level
 * full-library backup primitive. This is the *physical* Dexie dump (every table,
 * incl. `meta`), distinct from the logical `SnapshotEnvelope` that Export/Import
 * (Epic 7) selects and reshapes; use the gateway's `snapshotFromDb` for that.
 */
export function exportDbBlob(db: AchordeonDb): Promise<Blob> {
  return exportDB(db);
}

/**
 * Restore a dumped Blob into the database, replacing current contents — the
 * "download from Drive → full restore" path. `acceptNameDiff` lets a dump be
 * restored into a differently-named DB instance (tools, tests); tombstones ride
 * along like any other row, so a restore re-applies deletes rather than undoing them.
 */
export async function importDbBlob(db: AchordeonDb, blob: Blob): Promise<void> {
  await importInto(db, blob, {
    clearTablesBeforeImport: true,
    acceptNameDiff: true,
  });
}
