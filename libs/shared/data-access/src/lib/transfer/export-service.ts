// ExportService — Epic 7 ▸ subtask 1
// Spec: PRD-INFRASTRUCTURE.md §1 (ExportService: Songs/Songbooks → JSON), §8
// (the canonical round-trip; same shape Dexie emits), ADR-0007 (the envelope
// carries the schemaVersion so the reader knows what it is holding).
//
// Export is the *computer* format (`export-import.mdx`): a small database, not
// a picture. It is deliberately the same `SnapshotEnvelope` that sync and the
// boot gateway speak, so a file a user emails themselves and a file Drive holds
// are the same thing, read by the same code.

import { Injectable, inject } from '@angular/core';
import {
  ALL_SONGS_ID,
  SCHEMA_VERSION,
  type Song,
  type Songbook,
  type SnapshotEnvelope,
  type Uuid,
} from '@achordeon/shared/domain';
import { SONGBOOK_REPOSITORY, SONG_REPOSITORY } from '../stores/repositories';
import { ACHORDEON_DB } from '../stores/repositories';
import { readDeviceId } from '../persistence/gateway';
import { fileDate, saveFile, toFileSlug } from './file-io';

/** What to put in the file. Empty means empty — this never means "everything". */
export interface ExportSelection {
  readonly songIds?: readonly Uuid[];
  readonly songbookIds?: readonly Uuid[];
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly songs = inject(SONG_REPOSITORY);
  private readonly songbooks = inject(SONGBOOK_REPOSITORY);
  private readonly db = inject(ACHORDEON_DB);

  /**
   * The selection as an envelope.
   *
   * **A songbook drags its songs along.** A book is an ordered list of
   * references, so exporting one without them would produce a file that imports
   * an empty songbook on any machine that does not already have the songs —
   * which is precisely the machine you are exporting *to*. Songs the caller also
   * picked by hand are not duplicated; ids are a set.
   */
  async snapshot(selection: ExportSelection): Promise<SnapshotEnvelope> {
    // The virtual **All songs** is not a record — exporting it means "the whole
    // library", so it contributes every song and no songbook. The real ids in
    // the same selection still resolve as usual.
    const isAllSongs = (selection.songbookIds ?? []).includes(ALL_SONGS_ID);
    const realBookIds = (selection.songbookIds ?? []).filter(
      (id) => id !== ALL_SONGS_ID,
    );

    const books = await this.pick(this.songbooks, realBookIds);
    const wanted = new Set<Uuid>(selection.songIds ?? []);
    for (const book of books) {
      for (const entry of book.entries) wanted.add(entry);
    }
    const songs = isAllSongs
      ? (await this.songs.all()).filter((song) => song.deletedAt === null)
      : await this.pick(this.songs, [...wanted]);

    return {
      schemaVersion: SCHEMA_VERSION,
      deviceId: await readDeviceId(this.db),
      updatedAt: Date.now(),
      // No `user` row: it holds the account and the GLOBAL render defaults, and
      // a file that quietly re-based someone else's whole library on the
      // sender's defaults would change every song they already had. Global
      // settings travel by sync (Epic 10), which is the path that means "this is
      // the same person".
      data: { user: [], songs, songbooks: books },
    };
  }

  /** The envelope as the text that goes in the file — indented, because §8 calls
   * it "easily editable in a text editor of your choice". */
  toJson(snapshot: SnapshotEnvelope): string {
    return JSON.stringify(snapshot, null, 2);
  }

  /** Build it and hand it to the browser. Returns what was written, for a test
   * (and for a caller that wants to say how much went). */
  async export(
    selection: ExportSelection,
    name?: string,
  ): Promise<SnapshotEnvelope> {
    const snapshot = await this.snapshot(selection);
    await saveFile(
      this.toJson(snapshot),
      this.filename(snapshot, name),
      'application/json',
    );
    return snapshot;
  }

  /**
   * `achordeon-<what>-<date>.json`. A single item is named after itself, because
   * that is the file the user will go looking for; anything else is just "an
   * export", and the date is what tells two of them apart.
   */
  filename(snapshot: SnapshotEnvelope, name?: string): string {
    const { songs, songbooks } = snapshot.data;
    const only =
      name ??
      (songs.length + songbooks.length === 1
        ? (songbooks[0]?.name ?? songs[0]?.name)
        : undefined);
    return `achordeon-${toFileSlug(only ?? 'export', 'export')}-${fileDate()}.json`;
  }

  /** Rows by id, tombstones dropped, in the order asked for. */
  private async pick<T extends Song | Songbook>(
    repo: { get(id: Uuid): Promise<T | undefined> },
    ids: readonly Uuid[] | undefined,
  ): Promise<T[]> {
    if (!ids?.length) return [];
    const rows: (T | undefined)[] = await Promise.all(
      ids.map((id) => repo.get(id)),
    );
    return rows.filter(
      (row): row is T => row !== undefined && row.deletedAt === null,
    );
  }
}
