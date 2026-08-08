// The import boundary's normaliser — ADR-0014
//
// Until the schema was published every Achordeon file had been written by
// Achordeon, and the only hand-editing anyone did was to a file that was already
// complete. A **hand-written envelope** — one an assistant authored from the
// published schema, never by our own code — is now an ordinary inbound file, and
// models write the fields that carry information and omit the ones that do not.
//
// Three of the record's emptiest fields fail, differently, when omitted, and none
// of the three raises `ImportError`, so none reaches the "could not be imported"
// dialog:
//
//   - no `settings` on a song → `Object.keys(undefined)` throws in `migration.ts`
//   - no `user` on the data   → `undefined.map()` throws in the same function
//   - no `deletedAt`          → `undefined === null` is false, so `planImport`
//     filters the song out and the preview reports an empty file, silently
//
// This runs inside `ImportService.parse`, between the gate and `migrate` — not a
// second door and not a pre-pass any caller can skip (ADR-0007's one gateway).
// `SnapshotData` stays as declared: the sync and backup paths genuinely carry an
// account row and genuinely require these fields, and loosening the type to match
// the wire's tolerance would push the leniency into code that should not have it.
//
// **The discipline cost is real**: every field added to `Song` or `Songbook` from
// here on carries a "does the boundary default this?" question. Forget it and the
// field behaves as before for machine-written files while throwing or vanishing
// for hand-written ones.

import {
  ACHORDEON_URL,
  resolveSongbookPrint,
  type SnapshotEnvelope,
  type Song,
  type SongCache,
  type Songbook,
  type Uuid,
} from '@achordeon/shared/domain';

/**
 * An envelope as it actually arrives.
 *
 * This is what the gate has established and no more: a numeric `schemaVersion`
 * and two arrays. Everything else — including the *contents* of those arrays — is
 * whatever was in the file. Declaring it honestly is what stops the rest of this
 * module from being written against a type that is lying to it.
 */
export interface InboundEnvelope {
  readonly schemaVersion: number;
  readonly data: {
    readonly songs: readonly unknown[];
    readonly songbooks: readonly unknown[];
  };
}

export interface NormaliseOptions {
  /** For a song that arrived without an id (CONTEXT.md §Import: an envelope's
   * ids are trusted, anything else mints). */
  readonly newId: () => Uuid;
  /** The clock, so a test can read the timestamps it will get. */
  readonly now: number;
  /**
   * Title and subtitle, read back off the parser.
   *
   * `cache` is derived state (PRD-DOMAIN-MODEL §Song) and an incoming file's copy
   * may disagree with its own content — a hand-written one usually has no copy at
   * all. So it is never believed and always recomputed. Injected rather than
   * imported because parsing needs a `ChordTheory`, which is bound in the
   * composition layer (ADR-0008); this file stays pure.
   */
  readonly derive: (content: string) => SongCache;
}

/**
 * An inbound envelope as a complete one, with nothing invented that the file
 * could have said for itself.
 *
 * Preserve-unknown (ADR-0007) holds here as everywhere: each record is patched in
 * place by spread, never rebuilt from a whitelist, so fields written by a newer
 * build ride through untouched.
 */
export function normalise(
  inbound: InboundEnvelope,
  options: NormaliseOptions,
): SnapshotEnvelope {
  const envelope = inbound as Partial<SnapshotEnvelope> & InboundEnvelope;
  return {
    // A line for whoever found the file, read by nothing (see `SnapshotEnvelope`)
    // — so a writer that left it out is told where the file belongs rather than
    // asked to have known.
    app: str(envelope.app) ?? ACHORDEON_URL,
    schemaVersion: envelope.schemaVersion,
    // Sync's per-row LWW reads this; an import means nothing by it. Empty rather
    // than invented, because a made-up device id would be indistinguishable from
    // a real one the first time this envelope reached a sync path.
    deviceId: str(envelope.deviceId) ?? '',
    updatedAt: num(envelope.updatedAt) ?? options.now,
    data: {
      // **Emptied, not defaulted.** `data.user` is a Snapshot's field, not an
      // Export's (CONTEXT.md §Snapshot): it carries the account row and the
      // GLOBAL render defaults, `planImport` and `applyImport` never read it, and
      // a file that quietly re-based someone's whole library on the sender's
      // defaults would change every song they already had. So an import does not
      // merely tolerate its absence — it refuses to honour it when present.
      user: [],
      songs: inbound.data.songs.map((song) => normaliseSong(song, options)),
      songbooks: inbound.data.songbooks.map((book) =>
        normaliseSongbook(book, options),
      ),
    },
  };
}

function normaliseSong(value: unknown, options: NormaliseOptions): Song {
  const song = record(value) as Partial<Song> & Record<string, unknown>;
  const content = str(song.content) ?? '';
  const cache = options.derive(content);
  return {
    ...song,
    id: str(song.id) ?? options.newId(),
    // The library label falls back to the song's own title — the same answer the
    // first-run guide song gives (`provideAchordeonSeed`), and a nameless row is
    // a row the user cannot find.
    name: str(song.name) ?? cache.title,
    content,
    favorite: song.favorite === true,
    settings: bag(song.settings),
    createdAt: num(song.createdAt) ?? options.now,
    updatedAt: num(song.updatedAt) ?? options.now,
    // Absent means live. This is the silent one: `planImport` drops every song
    // whose `deletedAt` is not exactly `null`, so an `undefined` here imports a
    // file's worth of nothing and says so as "0 songs".
    deletedAt: num(song.deletedAt) ?? null,
    // Last, so it overwrites whatever the file claimed: `cache` is derived state
    // and a file's copy may disagree with its own content.
    cache,
  };
}

function normaliseSongbook(
  value: unknown,
  options: NormaliseOptions,
): Songbook {
  const book = record(value) as Partial<Songbook> & Record<string, unknown>;
  return {
    ...book,
    id: str(book.id) ?? options.newId(),
    name: str(book.name) ?? '',
    // The title-page fields are authored through the GUI, not parsed — there is
    // nothing to derive them from, so empty is the honest answer.
    title: str(book.title) ?? '',
    subtitle: str(book.subtitle) ?? '',
    author: str(book.author) ?? '',
    settings: bag(book.settings),
    entries: Array.isArray(book.entries)
      ? book.entries.filter((entry): entry is Uuid => typeof entry === 'string')
      : [],
    createdAt: num(book.createdAt) ?? options.now,
    updatedAt: num(book.updatedAt) ?? options.now,
    deletedAt: num(book.deletedAt) ?? null,
    // Optional on the record and resolved wherever it is read, so a partial one
    // is filled in here rather than left half-answered downstream.
    print: book.print ? resolveSongbookPrint(book.print) : book.print,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** A settings bag, or the empty one. Contents are NOT filtered — an unknown key
 * is preserved deliberately and reported as `hasUnknownSettings` (ADR-0007). */
function bag<T>(value: unknown): T {
  return (typeof value === 'object' && value !== null ? value : {}) as T;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
