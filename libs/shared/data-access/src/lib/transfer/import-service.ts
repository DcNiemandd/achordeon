// ImportService — Epic 7 ▸ subtasks 2–3
// Spec: PRD-INFRASTRUCTURE.md §8 (accept Export JSON + downloaded files with
// embedded metadata; songs replace/ignore/create-new, songbooks always new),
// ADR-0007 (**one** ingest gateway — every inbound path runs `migrate` first).
//
// Three steps, deliberately not one call: read (what is in this file), plan
// (what would it do to my library), apply (do it). The middle step is the whole
// point — a file that silently overwrote nineteen songs because the twentieth
// matched would be indefensible, so the answer to "what collides" has to be
// available *before* anything is written.

import { Injectable, inject } from '@angular/core';
import {
  applyImport,
  migrate,
  planImport,
  type ImportChoices,
  type ImportPlan,
  type ImportWrite,
  type MigrateStatus,
  type SnapshotEnvelope,
} from '@achordeon/shared/domain';
import { SONGBOOK_REPOSITORY, SONG_REPOSITORY } from '../stores/repositories';
import { readTextFile } from './file-io';
import { readEmbeddedSnapshot } from './embedded-metadata';

/** A file that could not be read as a library. */
export class ImportError extends Error {
  constructor(readonly reason: 'unreadable' | 'refused') {
    super(reason);
    this.name = 'ImportError';
  }
}

export interface ImportSource {
  readonly snapshot: SnapshotEnvelope;
  /** `warn` = it carries settings this build does not know (additive, from a
   * newer app). Preserved either way — the user is told, not stopped. */
  readonly status: MigrateStatus;
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly songs = inject(SONG_REPOSITORY);
  private readonly songbooks = inject(SONGBOOK_REPOSITORY);

  /**
   * A picked file as a migrated envelope.
   *
   * A **downloaded** file is accepted too, where it carries the metadata the
   * download put in it (§8) — the same JSON, riding inside the picture. That is
   * the difference between "a PNG of my song" and "my song", and the reason a
   * user can hand a friend one file rather than two.
   *
   * `refuse` from the gateway is a hard stop, not a warning: the file was
   * written by a build with a breaking schema this one cannot read, and guessing
   * a down-migration is how a library gets quietly mangled (ADR-0007).
   */
  async read(file: Blob): Promise<ImportSource> {
    const raw =
      (await readEmbeddedSnapshot(file)) ?? (await readTextFile(file));
    const parsed = this.parse(raw);
    const { snapshot, status } = migrate(parsed);
    if (status === 'refuse') throw new ImportError('refused');
    return { snapshot, status };
  }

  /** What this envelope would do to the library as it stands right now. */
  async plan(snapshot: SnapshotEnvelope): Promise<ImportPlan> {
    return planImport(snapshot.data, await this.songs.all());
  }

  /** Write the plan under the user's answer. Returns what actually landed. */
  async apply(
    plan: ImportPlan,
    choices: Omit<ImportChoices, 'now' | 'newId'>,
  ): Promise<ImportWrite> {
    const write = applyImport(plan, {
      ...choices,
      now: Date.now(),
      newId: () => crypto.randomUUID(),
    });
    // Songs first: a songbook whose songs are not there yet is a book of blank
    // slots, and the write is not one transaction (two tables, two repos).
    if (write.songs.length) await this.songs.bulkPut(write.songs);
    if (write.songbooks.length) await this.songbooks.bulkPut(write.songbooks);
    return write;
  }

  /**
   * Text → envelope, with the shape actually checked.
   *
   * A file is untrusted input, and `JSON.parse` will happily hand back a number.
   * This is the boundary where "some text a user picked" becomes a typed value,
   * so it is where the check belongs — not three layers down where the failure
   * would read as a bug in the migrator.
   */
  private parse(raw: string): SnapshotEnvelope {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ImportError('unreadable');
    }
    if (!isEnvelope(value)) throw new ImportError('unreadable');
    return value;
  }
}

function isEnvelope(value: unknown): value is SnapshotEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<SnapshotEnvelope>;
  const data = envelope.data;
  return (
    typeof envelope.schemaVersion === 'number' &&
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.songs) &&
    Array.isArray(data.songbooks)
  );
}
