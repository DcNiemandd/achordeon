// Import planning — Epic 7 ▸ subtasks 2–3
// Spec: PRD-INFRASTRUCTURE.md §8 (songs replace / ignore / create-new, + import
// all as new with a date prefix; songbooks always create new), ADR-0007 (every
// inbound path goes through `migrate` first — this runs after it).
//
// Pure: what a file would do to the library, decided before anything is written.
// The two halves are deliberately separate — `planImport` answers "what collides"
// so the UI can ask, `applyImport` answers "then write this" once it has been
// told. Nothing here touches a repository, so both are unit-testable against
// plain arrays.

import type { Song, Songbook, Uuid } from './entities';
import type { SnapshotData } from './snapshot';

/** What to do with the songs that already exist locally, by id. */
export type SongResolution = 'replace' | 'ignore' | 'new';

/** One incoming song whose id is already in the library. */
export interface ImportConflict {
  readonly id: Uuid;
  /** What the file calls it, and what the library calls it — rarely the same,
   * which is the fact that makes the choice answerable. */
  readonly incomingName: string;
  readonly existingName: string;
}

export interface ImportPlan {
  readonly songs: readonly Song[];
  readonly songbooks: readonly Songbook[];
  readonly conflicts: readonly ImportConflict[];
  /** Ids the library already holds — what tells a songbook slot the file does
   * not carry apart from one that points at nothing at all. */
  readonly existingIds: ReadonlySet<Uuid>;
}

export interface ImportChoices {
  /** Applied to every conflicting song — one decision for the file, not one per
   * row. A per-row answer is a dialog nobody finishes for a 200-song export. */
  readonly resolution: SongResolution;
  /** Import **everything** as a new copy, conflict or not, with today's date in
   * front of the name (PRD-INFRASTRUCTURE.md §8). The escape hatch for "I want
   * both versions and I will sort them out myself". */
  readonly isAllNew?: boolean;
  readonly now: number;
  /** Injected so a test can read the ids it will get. */
  readonly newId: () => Uuid;
}

export interface ImportWrite {
  readonly songs: Song[];
  readonly songbooks: Songbook[];
  /** How many incoming songs were skipped — the only outcome with nothing to
   * show for it afterwards, so the caller has to be able to say it happened. */
  readonly ignored: number;
}

/** `YYYY-MM-DD`, the prefix an import-all-as-new puts in front of every name. */
export function datePrefix(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * What this file would land in a library that already holds `existing`.
 *
 * Tombstones in the incoming data are **dropped, not imported**: a snapshot
 * carries them so a *sync* can propagate a delete (PRD-INFRASTRUCTURE.md §1),
 * but an import is someone handing you songs — a file that silently deleted rows
 * on the receiving side would be the least expected thing it could do.
 */
export function planImport(
  incoming: SnapshotData,
  existing: readonly Song[],
): ImportPlan {
  const byId = new Map(existing.map((song) => [song.id, song]));
  const songs = incoming.songs.filter((song) => song.deletedAt === null);
  const songbooks = incoming.songbooks.filter(
    (book) => book.deletedAt === null,
  );
  const conflicts: ImportConflict[] = [];
  for (const song of songs) {
    const local = byId.get(song.id);
    if (local) {
      conflicts.push({
        id: song.id,
        incomingName: song.name,
        existingName: local.name,
      });
    }
  }
  return { songs, songbooks, conflicts, existingIds: new Set(byId.keys()) };
}

/**
 * The records to write, with ids settled.
 *
 * **A songbook is always a new songbook** (§8) — never a replace, because its
 * content *is* its order and merging two orders has no defensible answer. Which
 * means its `entries` have to be re-pointed: a song imported as a new copy is a
 * different record, and a book that kept the old id would quietly fill up with
 * the *local* songs it was never about. An ignored song is the one case where
 * the old id is right — the local record is the one the user chose to keep.
 */
export function applyImport(
  plan: ImportPlan,
  choices: ImportChoices,
): ImportWrite {
  const conflicting = new Set(plan.conflicts.map((c) => c.id));
  const resolution: SongResolution = choices.isAllNew
    ? 'new'
    : choices.resolution;
  const prefix = choices.isAllNew ? `${datePrefix(choices.now)} ` : '';

  /** Incoming song id → the id it ends up under locally. */
  const remap = new Map<Uuid, Uuid>();
  const songs: Song[] = [];
  let ignored = 0;

  for (const song of plan.songs) {
    const isConflict = conflicting.has(song.id);
    const action: SongResolution =
      choices.isAllNew || isConflict ? resolution : 'replace';

    if (action === 'ignore') {
      // The local record stands, and it is what any imported songbook means.
      remap.set(song.id, song.id);
      ignored++;
      continue;
    }

    // 'replace' on a non-conflict is just "write it" — the id is free.
    const id = action === 'new' ? choices.newId() : song.id;
    remap.set(song.id, id);
    songs.push({
      ...song,
      id,
      name: `${prefix}${song.name}`,
      // A copy is a new record with its own life (CONTEXT.md §Song); a replace
      // keeps the original's birthday and admits it just changed.
      createdAt: action === 'new' ? choices.now : song.createdAt,
      updatedAt: choices.now,
      deletedAt: null,
    });
  }

  const songbooks = plan.songbooks.map((book) => ({
    ...book,
    id: choices.newId(),
    name: `${prefix}${book.name}`,
    createdAt: choices.now,
    updatedAt: choices.now,
    deletedAt: null,
    // A slot pointing at a song neither the file nor the library has is dropped
    // rather than left dangling — the songbook UI would have to defend against
    // it forever, and a hand-edited export is exactly where one comes from.
    entries: book.entries
      .filter((entry) => remap.has(entry) || plan.existingIds.has(entry))
      .map((entry) => remap.get(entry) ?? entry),
  }));

  return { songs, songbooks, ignored };
}
