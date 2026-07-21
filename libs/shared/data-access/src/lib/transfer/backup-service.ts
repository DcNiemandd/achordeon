// BackupService — Epic 4 ▸ subtask 7 (the UI that was missing)
// Spec: PRD-INFRASTRUCTURE.md §4 (dexie-export-import "produces the Snapshot blob
// for free"), §8. The whole-database file backup: every table, every row,
// tombstones and meta included.
//
// **Distinct from Export.** Export selects songs and songbooks and reshapes them
// into a portable `SnapshotEnvelope` for moving *some* work between machines and
// merging it in. A backup is the *whole physical database* dumped verbatim —
// meta rows, deviceId and all — for "put my machine back exactly as it was".
// Restoring one **replaces** everything; importing an export merges. Two jobs,
// two files, two buttons.

import { Injectable, inject } from '@angular/core';
import { ACHORDEON_DB } from '../stores/repositories';
import { exportDbBlob, importDbBlob } from '../persistence/snapshot-blob';
import { fileDate, saveFile } from './file-io';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly db = inject(ACHORDEON_DB);

  /** Dump the whole database to a file. */
  async backup(): Promise<void> {
    const blob = await exportDbBlob(this.db);
    await saveFile(
      blob,
      `achordeon-backup-${fileDate()}.json`,
      'application/json',
    );
  }

  /**
   * Replace the whole database from a backup file.
   *
   * A full restore, not a merge: `importDbBlob` clears every table first, so this
   * is the "put it back exactly" path and it throws away whatever is here now.
   * The caller is expected to have warned — this is the point of no return.
   *
   * The page reloads afterwards (the caller's job): the running stores hold a
   * window of the *old* data, and re-querying every one of them is more work than
   * booting fresh against the restored tables.
   */
  async restore(file: Blob): Promise<void> {
    await importDbBlob(this.db, file);
  }
}
