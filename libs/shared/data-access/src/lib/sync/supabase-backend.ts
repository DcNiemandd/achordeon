// SupabaseSyncBackend — Epic 10 ▸ automatic paid-tier sync
// Spec: PRD-INFRASTRUCTURE.md §5, ADR-0004 (pull-on-launch, coarse push, per-row LWW).
//
// The relational mirror of the local library. Push upserts the changed rows;
// pull reads rows whose `updated_at` moved past the caller's watermark. RLS
// fences every statement to `auth.uid()`, so this never names an owner — the
// server fills it — and can never touch another account's rows.

import { Injectable, inject } from '@angular/core';
import {
  SCHEMA_VERSION,
  type SnapshotEnvelope,
} from '@achordeon/shared/domain';
import { SupabaseService } from '../lobby/supabase-client';
import { AuthService } from '../auth/auth-service';
import type { SyncBackend } from './sync-backend';
import {
  profileToUser,
  rowToSong,
  rowToSongbook,
  songToRow,
  songbookEntryRows,
  songbookToRow,
  userToProfilePatch,
  type ProfileRow,
  type SongRow,
  type SongbookRow,
  type SongbookSongRow,
} from './supabase-mapping';

@Injectable({ providedIn: 'root' })
export class SupabaseSyncBackend implements SyncBackend {
  readonly id = 'supabase' as const;

  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async pull(since: number): Promise<SnapshotEnvelope | null> {
    const client = await this.supabase.client();
    const uid = this.auth.user()?.id;
    if (client === null || !uid) return null;

    const [songs, songbooks, profile] = await Promise.all([
      client.from('songs').select('*').gt('updated_at', since),
      client.from('songbooks').select('*').gt('updated_at', since),
      client
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .gt('updated_at', since)
        .maybeSingle(),
    ]);

    const songRows = (songs.data ?? []) as SongRow[];
    const bookRows = (songbooks.data ?? []) as SongbookRow[];

    // A songbook row moves only when its entries do (a reorder rewrites the row's
    // `updated_at`), so the changed books are exactly the ones whose slots to
    // re-read. `songbook_songs` carries no clock of its own.
    let entryRows: SongbookSongRow[] = [];
    if (bookRows.length > 0) {
      const bookIds = bookRows.map((b) => b.id);
      const entries = await client
        .from('songbook_songs')
        .select('*')
        .in('songbook_id', bookIds);
      entryRows = (entries.data ?? []) as SongbookSongRow[];
    }

    const profileRow = profile.data as ProfileRow | null;
    const user = profileRow ? profileToUser(profileRow) : null;

    return {
      schemaVersion: SCHEMA_VERSION,
      deviceId: 'supabase',
      updatedAt: Date.now(),
      data: {
        user: user ? [user] : [],
        songs: songRows.map(rowToSong),
        songbooks: bookRows.map((b) => rowToSongbook(b, entryRows)),
      },
    };
  }

  async push(snapshot: SnapshotEnvelope): Promise<void> {
    const client = await this.supabase.client();
    const uid = this.auth.user()?.id;
    if (client === null || !uid) return;

    const { user, songs, songbooks } = snapshot.data;

    if (songs.length > 0) {
      const { error } = await client.from('songs').upsert(songs.map(songToRow));
      if (error) throw error;
    }

    for (const book of songbooks) {
      const { error } = await client
        .from('songbooks')
        .upsert(songbookToRow(book));
      if (error) throw error;
      // Replace the whole slot list for a changed songbook: entries are ordered
      // and a `song_id` may repeat, so a positional diff is not worth it —
      // clear-and-reinsert is the honest write of "these are its entries now".
      await client.from('songbook_songs').delete().eq('songbook_id', book.id);
      const entryRows = songbookEntryRows(book);
      if (entryRows.length > 0) {
        const { error: e2 } = await client
          .from('songbook_songs')
          .insert(entryRows);
        if (e2) throw e2;
      }
    }

    // The account row: upsert only the columns we own — `plan` is deliberately
    // omitted so a client push can never raise its own tier.
    if (user.length > 0) {
      const { error } = await client
        .from('profiles')
        .upsert({ id: uid, ...userToProfilePatch(user[0]) });
      if (error) throw error;
    }
  }
}
