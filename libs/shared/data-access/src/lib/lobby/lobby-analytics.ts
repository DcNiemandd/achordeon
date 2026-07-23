// Lobby analytics — Epic 9 ▸ subtask 6
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0003 (append-only, off the
// Presence critical path)
//
// A write-only history of lobby lifecycle events, never a live registry: it does
// not gate anything and the live path never reads it. Every write is
// **best-effort and fire-and-forget** — a failed insert (offline, no auth, RLS)
// must never disturb a performance, so nothing here is awaited on the hot path
// and every error is swallowed. `song_ref` travels, song content never does.

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase-client';

/** The two lifecycle events worth recording (ADR-0003). */
export type LobbyEventKind = 'created' | 'song_changed';

@Injectable({ providedIn: 'root' })
export class LobbyAnalytics {
  private readonly supabase = inject(SupabaseService);

  /** A lobby was opened. */
  created(pin: string, songRef: string): void {
    this.record('created', pin, songRef);
  }

  /** The host advanced to a different song. */
  songChanged(pin: string, songRef: string): void {
    this.record('song_changed', pin, songRef);
  }

  /**
   * Insert one row, best-effort. Not awaited by callers and never throws: the
   * table is RLS insert-by-owner, so without a signed-in host (Epic 10) the
   * insert is simply denied — which is fine, analytics is not load-bearing.
   */
  private record(event: LobbyEventKind, pin: string, songRef: string): void {
    void (async () => {
      try {
        const client = await this.supabase.client();
        if (!client) return;
        await client
          .from('lobby_events')
          .insert({ event, pin, song_ref: songRef });
      } catch {
        // Swallowed on purpose — see the class comment.
      }
    })();
  }
}
