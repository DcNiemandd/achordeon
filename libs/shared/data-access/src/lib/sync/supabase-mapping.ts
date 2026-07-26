// Snapshot ⇄ relational-row mapping — Epic 10 ▸ Supabase backend
// Spec: PRD-INFRASTRUCTURE.md §5 (relational, not blobs; same uuid as local row).
//
// Pure translation between the in-memory Snapshot shape and the flat rows the
// Supabase tables hold. The one boundary where the embedded `entries[]` is
// flattened into `songbook_songs` and folded back — kept here, and tested, so
// neither the backend nor the DB schema has to know the other's shape.

import type { Song, Songbook, SongCache, User } from '@achordeon/shared/domain';
import type {
  GlobalSettings,
  SongSettings,
  SongbookSettings,
} from '@achordeon/shared/domain';

/** A `public.songs` row. Timestamps are epoch-ms (the client LWW clock). */
export interface SongRow {
  id: string;
  owner?: string; // filled server-side from auth.uid() on insert
  name: string;
  content: string;
  favorite: boolean;
  settings: SongSettings;
  cache: SongCache;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** A `public.songbooks` row (its ordered entries live in `songbook_songs`). */
export interface SongbookRow {
  id: string;
  owner?: string;
  name: string;
  title: string;
  subtitle: string;
  author: string;
  settings: SongbookSettings;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** One ordered slot of a songbook. `song_id` MAY repeat within a songbook. */
export interface SongbookSongRow {
  songbook_id: string;
  song_id: string;
  position: number;
  owner?: string;
}

/** A `public.profiles` row — the account, keyed by the auth user id. */
export interface ProfileRow {
  id: string; // = auth.uid()
  plan: 'free' | 'pro';
  // The local `User.id`, so a pull round-trips it. `text`, not `uuid`: the account
  // row is a singleton whose id is the constant `LOCAL_USER_ID` — a string a uuid
  // generator cannot mint, and one a `uuid` column will not take.
  record_id: string | null;
  username: string;
  settings: GlobalSettings;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function songToRow(song: Song): SongRow {
  return {
    id: song.id,
    name: song.name,
    content: song.content,
    favorite: song.favorite,
    settings: song.settings,
    cache: song.cache,
    created_at: song.createdAt,
    updated_at: song.updatedAt,
    deleted_at: song.deletedAt,
  };
}

export function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    favorite: row.favorite,
    settings: row.settings ?? {},
    cache: row.cache ?? { title: '', subtitle: '' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function songbookToRow(book: Songbook): SongbookRow {
  return {
    id: book.id,
    name: book.name,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    settings: book.settings,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
    deleted_at: book.deletedAt,
  };
}

/** Flatten a songbook's ordered entries into positioned join rows. */
export function songbookEntryRows(book: Songbook): SongbookSongRow[] {
  return book.entries.map((song_id, position) => ({
    songbook_id: book.id,
    song_id,
    position,
  }));
}

/**
 * Fold a songbook row and its (unordered) join rows back into one `Songbook`.
 * The join rows are sorted by `position` here — the query need not return them
 * ordered, and a repeated `song_id` is preserved as the distinct slot it is.
 */
export function rowToSongbook(
  row: SongbookRow,
  entryRows: readonly SongbookSongRow[],
): Songbook {
  const entries = entryRows
    .filter((e) => e.songbook_id === row.id)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => e.song_id);
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    settings: row.settings ?? {},
    entries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** The single local `User` mapped to its profile columns (id filled by caller
 * from `auth.uid()`). `plan` is server-owned and never written from here. */
export function userToProfilePatch(
  user: User,
): Omit<ProfileRow, 'id' | 'plan'> {
  return {
    record_id: user.id,
    username: user.username,
    settings: user.settings,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    deleted_at: user.deletedAt,
  };
}

/** Reconstruct the local `User` from a profile, or `null` if it has never been
 * pushed (no `record_id`). `plan` is mirrored into `planCache`. */
export function profileToUser(row: ProfileRow): User | null {
  if (row.record_id === null) return null;
  return {
    id: row.record_id,
    username: row.username,
    planCache: row.plan,
    settings: row.settings ?? ({} as GlobalSettings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
