// Import planning — Epic 7 ▸ subtasks 2–3
// Spec: PRD-INFRASTRUCTURE.md §8 (songs replace / ignore / create-new, + import
// all as new with a date prefix; a songbook replaces the one under its id, so a
// reimport updates in place instead of duplicating), ADR-0007 (every inbound path
// goes through `migrate` first — this runs after it).
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
  /** The songbooks already in the library, by id — what lets a reimport of the
   * same book resolve to a no-op instead of a duplicate. */
  readonly existingBooks: ReadonlyMap<Uuid, Songbook>;
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
  existingBooks: readonly Songbook[] = [],
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
  return {
    songs,
    songbooks,
    conflicts,
    existingIds: new Set(byId.keys()),
    existingBooks: new Map(existingBooks.map((book) => [book.id, book])),
  };
}

/**
 * The records to write, with ids settled.
 *
 * A songbook **keeps its own id and replaces the one already under it** — the
 * same rule a song's `replace` follows. Minting a fresh id instead is what made a
 * reimport of the same file pile up duplicates: the stored book drifted to a new
 * id every time, so it could never be recognised as the one the file was about.
 * Replace is not the merge the old design feared — merging two *orders* has no
 * answer, but taking the file's version wholesale does, and it is what "import
 * this book again" plainly means.
 *
 * Its `entries` are still re-pointed: a song imported as a new copy is a different
 * record, and a book that kept the old id would quietly fill up with the *local*
 * songs it was never about. An ignored song is the one case where the old id is
 * right — the local record is the one the user chose to keep.
 *
 * Two escapes from replace-in-place. A **live** book already here unchanged is
 * dropped, not rewritten — a reimport of the same file has nothing to add, and
 * writing it would only bump its `updatedAt`. And an **import-all-as-new** takes a
 * fresh id like everything else in that mode, so "I want both" keeps both.
 *
 * The unchanged-skip is for a live book only. If the local copy was **soft-
 * deleted**, reimporting it writes over the tombstone with `deletedAt: null` and
 * brings it back — an undelete is exactly what handing the file back should mean.
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

  const songbooks: Songbook[] = [];
  for (const book of plan.songbooks) {
    // A slot pointing at a song neither the file nor the library has is dropped
    // rather than left dangling — the songbook UI would have to defend against
    // it forever, and a hand-edited export is exactly where one comes from.
    const entries = book.entries
      .filter((entry) => remap.has(entry) || plan.existingIds.has(entry))
      .map((entry) => remap.get(entry) ?? entry);

    // Already here, byte-for-byte the same *live* book? Nothing to write.
    // Compared after re-pointing, so it is the entries that *would* land that are
    // judged, not the file's raw ids. A date-prefixed all-new copy never matches
    // (the name differs), which is the point of that mode. A *tombstoned* match is
    // deliberately not skipped: the write below carries `deletedAt: null`, so
    // reimporting a book you deleted brings it back rather than staying a no-op.
    const existing = choices.isAllNew
      ? undefined
      : plan.existingBooks.get(book.id);
    if (
      existing?.deletedAt === null &&
      sameBook(existing, book, entries, prefix)
    ) {
      continue;
    }

    songbooks.push({
      ...book,
      // Keep the book's own id so a reimport lands on it instead of beside it;
      // all-new is the one mode that mints, because it is asking for a copy.
      id: choices.isAllNew ? choices.newId() : book.id,
      name: `${prefix}${book.name}`,
      // A replace keeps the local book's birthday; a first sighting keeps the
      // file's (it is the same book, just arriving); an all-new copy is born now.
      createdAt: choices.isAllNew
        ? choices.now
        : existing
          ? existing.createdAt
          : book.createdAt,
      updatedAt: choices.now,
      deletedAt: null,
      entries,
    });
  }

  return { songs, songbooks, ignored };
}

/**
 * Is `incoming` (with its entries already re-pointed to local ids) the same book
 * the library already holds? Every field the user can author is compared; the
 * bookkeeping ones (`id`, timestamps, `deletedAt`) are not, because those always
 * differ on a fresh landing and say nothing about whether the content changed.
 */
function sameBook(
  existing: Songbook,
  incoming: Songbook,
  entries: readonly Uuid[],
  prefix: string,
): boolean {
  return (
    existing.name === `${prefix}${incoming.name}` &&
    existing.title === incoming.title &&
    existing.subtitle === incoming.subtitle &&
    existing.author === incoming.author &&
    arraysEqual(existing.entries, entries) &&
    deepEqual(existing.settings, incoming.settings) &&
    deepEqual(existing.print, incoming.print)
  );
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Structural equality for the flat settings/print bags — plain records of
 * primitives, or `undefined` (an older row that never wrote the field). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  return (
    ak.length === bk.length &&
    ak.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    )
  );
}
