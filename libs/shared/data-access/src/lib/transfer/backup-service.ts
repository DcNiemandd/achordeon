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
import { mergeRecords } from '@achordeon/shared/domain';
import { ACHORDEON_DB } from '../stores/repositories';
import {
  exportDbBlob,
  importDbBlob,
  readDbBlob,
} from '../persistence/snapshot-blob';
import { fileDate, saveFile } from './file-io';

/**
 * What the user wants a backup file to do to the library they have.
 *
 * Two different acts, which is why the restore dialog asks rather than assuming.
 * `replace` is the backup's original promise — put the machine back exactly.
 * `merge` is the one people actually reach for most of the time: they want the
 * songs out of an old file without losing the ones they have written since.
 */
export type RestoreMode = 'replace' | 'merge';

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
   * Put a backup file into the library, the way the caller says.
   *
   * The page reloads afterwards (the caller's job) whichever mode ran: the
   * running stores hold a window of the *old* data, and re-querying every one of
   * them is more work than booting fresh against the written tables.
   */
  async restore(file: Blob, mode: RestoreMode): Promise<void> {
    if (mode === 'merge') {
      await this.mergeFrom(file);
      return;
    }
    await importDbBlob(this.db, file);
  }

  /**
   * Bring a backup's songs and songbooks in **beside** the ones already here.
   *
   * Per-row last-write-wins (`mergeRecords`), the same rule sync, Drive and
   * Import all reconcile by — one merge rule for the whole app, so a file read
   * through this door lands exactly where it would have landed through any other.
   * Tombstones ride along like any row: a delete recorded in the file is the
   * newest write to its id and wins, which is what stops an old backup
   * resurrecting songs the user has since thrown away.
   *
   * **The `user` row is deliberately not merged.** It is a singleton carrying the
   * username, the cached tier and the global render defaults, with no field-level
   * merge available — last-write-wins on it is all-or-nothing, so a file could
   * silently rename the account and re-base every song on another machine's
   * defaults. Import has never written it either, for the same reason: a file
   * brings in a library, not an identity. Taking the settings back is what
   * `replace` is for, and the dialog says so.
   */
  private async mergeFrom(file: Blob): Promise<void> {
    const incoming = await readDbBlob(file);
    const [songs, songbooks] = await Promise.all([
      this.db.songs.toArray(),
      this.db.songbooks.toArray(),
    ]);
    const mergedSongs = mergeRecords(songs, incoming.songs);
    const mergedBooks = mergeRecords(songbooks, incoming.songbooks);
    await this.db.transaction('rw', this.db.songs, this.db.songbooks, () =>
      Promise.all([
        this.db.songs.bulkPut(mergedSongs),
        this.db.songbooks.bulkPut(mergedBooks),
      ]),
    );
  }

  /**
   * Wipe this device's copy of the library — every table cleared, `meta` included
   * (the deviceId regenerates on next read). The "delete this device" half of
   * account deletion; the cloud copy is untouched, so a later sign-in syncs it
   * back. The caller reloads afterwards for a clean, freshly-booted app.
   */
  async clearLocal(): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.user,
      this.db.songs,
      this.db.songbooks,
      this.db.meta,
      async () => {
        await Promise.all([
          this.db.user.clear(),
          this.db.songs.clear(),
          this.db.songbooks.clear(),
          this.db.meta.clear(),
        ]);
      },
    );
  }
}
