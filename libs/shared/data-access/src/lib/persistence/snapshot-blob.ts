// Whole-DB Snapshot blob — Epic 4 ▸ subtask 7
// Spec: PRD-INFRASTRUCTURE.md §4 (dexie-export-import "produces the Snapshot blob for free")

import { exportDB, importInto } from 'dexie-export-import';
import type { SnapshotData } from '@achordeon/shared/domain';
import { AchordeonDb } from './db';

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

/**
 * Read a dumped Blob's rows **without touching the live database** — what a
 * merging restore needs, where `importDbBlob` would have thrown the library away
 * before anything could be compared.
 *
 * It imports into a scratch database and reads that, rather than parsing the
 * dump. The file's layout belongs to `dexie-export-import`; teaching a second
 * reader about `formatName`, table descriptors and row ordering would be owning
 * a format we deliberately took off the shelf, and it would rot the first time
 * that library changed a detail. Dexie's own reader cannot be wrong about
 * Dexie's own file.
 *
 * `meta` is not returned: `SnapshotData` is the *logical* library, and the
 * deviceId in the dump belongs to the machine that wrote it (ADR-0004 — it feeds
 * per-row LWW, so adopting someone else's would be adopting their identity).
 *
 * The scratch database is deleted whether or not the read worked. A damaged file
 * throws from `importInto`, which is the caller's cue to say so.
 */
export async function readDbBlob(blob: Blob): Promise<SnapshotData> {
  const scratch = new AchordeonDb(`${SCRATCH_DB}-${crypto.randomUUID()}`);
  try {
    await importInto(scratch, blob, {
      clearTablesBeforeImport: true,
      acceptNameDiff: true,
    });
    const [user, songs, songbooks] = await Promise.all([
      scratch.user.toArray(),
      scratch.songs.toArray(),
      scratch.songbooks.toArray(),
    ]);
    return { user, songs, songbooks };
  } finally {
    await scratch.delete();
  }
}

/** Prefix for the throwaway database a merging restore reads through. Suffixed
 * per call so two restores in flight cannot land in one another's scratch. */
const SCRATCH_DB = 'achordeon-restore-scratch';
