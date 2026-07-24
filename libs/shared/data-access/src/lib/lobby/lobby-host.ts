// Lobby host — Epic 9 ▸ subtask 1, 5, 6; durable-state follow-up
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0011 (durable lobby state,
// supersedes ADR-0003's Presence-only design).
//
// The performer's side of a lobby. Root-scoped **on purpose**: the performance
// is persistent (Epic 8), so the host may navigate to another module while
// hosting and the channel must outlive the `/stage/:id` route.
//
// The current song is PUBLISHED to a durable `lobbies` row through
// `lobby_publish`, which stamps it with a server-owned `rev`; that row is the
// source of truth a viewer reads on join and re-reads to recover. A Realtime
// Broadcast carries the same `{ rev, payload }` as a low-latency nudge, and
// Presence carries only `{ role: 'host' }` for the live audience count. Ending a
// lobby marks the row (`lobby_end`) and drops the channel.

import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { LobbyPayload, LobbyUpdate } from '@achordeon/shared/domain';
import { SupabaseService } from './supabase-client';
import { LobbyAnalytics } from './lobby-analytics';

export type LobbyHostStatus =
  | 'idle' // no lobby
  | 'connecting' // channel subscribing
  | 'hosting' // live, publishing a payload
  | 'unavailable'; // no backend configured, or the socket failed

/** `lobby:<PIN>` — one channel per PIN (ADR-0003). */
function channelName(pin: string): string {
  return `lobby:${pin}`;
}

/**
 * How long to coalesce rapid song changes before publishing. A performer tapping
 * "next" through a book to reach a song would otherwise write the full payload on
 * every tap. Only the song they land on matters; this waits for them to land.
 */
const UPDATE_DEBOUNCE_MS = 200;

@Injectable({ providedIn: 'root' })
export class LobbyHost {
  private readonly supabase = inject(SupabaseService);
  private readonly analytics = inject(LobbyAnalytics);

  private channel: RealtimeChannel | null = null;
  private currentPin = '';
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: LobbyPayload | null = null;

  private readonly _audienceCount = signal(0);
  /** Live viewers on the channel — Presence, minus the host's own entry. */
  readonly audienceCount = this._audienceCount.asReadonly();

  private readonly _status = signal<LobbyHostStatus>('idle');
  readonly status = this._status.asReadonly();

  /**
   * Make the lobby match `(pin, payload)`. The one method the presenter's effect
   * calls: opens the channel the first time (or when the PIN changes), and on
   * every subsequent song change publishes the new payload.
   *
   * Opening a channel (a new PIN) is immediate; **updates on the same PIN are
   * debounced** so tapping quickly through a book publishes only the song landed
   * on.
   */
  async sync(pin: string, payload: LobbyPayload): Promise<void> {
    if (pin !== this.currentPin) {
      this.cancelPending();
      await this.close();
      await this.open(pin, payload);
      return;
    }
    if (!this.channel) return;
    this.pending = payload;
    if (this.updateTimer !== null) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(
      () => void this.flushPending(),
      UPDATE_DEBOUNCE_MS,
    );
  }

  /** Publish the latest coalesced payload once the performer has settled. */
  private async flushPending(): Promise<void> {
    this.updateTimer = null;
    const payload = this.pending;
    this.pending = null;
    if (!this.channel || payload === null) return;
    await this.writeAndBroadcast(payload);
    this.analytics.songChanged(this.currentPin, payload.song.id);
  }

  private cancelPending(): void {
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.pending = null;
  }

  /**
   * Publish to the durable row (server-owned rev) and Broadcast the stamped
   * update. The row is the truth a joiner reads; the Broadcast is the nudge that
   * reaches the viewers already here without waiting for a `postgres_changes`
   * round trip.
   */
  private async writeAndBroadcast(payload: LobbyPayload): Promise<void> {
    const client = await this.supabase.client();
    if (!client || !this.channel) return;
    const rev = await this.publishRow(client, this.currentPin, payload);
    // A failed write is left for the row to correct: the Broadcast is only sent
    // when there is a real rev behind it, so a viewer never applies a payload the
    // durable truth does not also carry.
    if (rev === null) return;
    const update: LobbyUpdate = { rev, payload };
    await this.channel.send({
      type: 'broadcast',
      event: 'song',
      payload: update,
    });
  }

  /** `lobby_publish(pin, payload) -> rev`, or `null` when the write failed. */
  private async publishRow(
    client: SupabaseClient,
    pin: string,
    payload: LobbyPayload,
  ): Promise<number | null> {
    const { data, error } = await client.rpc('lobby_publish', {
      p_pin: pin,
      p_payload: payload,
    });
    return error || typeof data !== 'number' ? null : data;
  }

  /** Retire the lobby: mark the row ended (kept, not deleted) and drop the channel. */
  async close(): Promise<void> {
    this.cancelPending();
    const pin = this.currentPin;
    const client = await this.supabase.client();
    if (pin && client) {
      // Ended before the channel drops, so viewers learn the lobby ended from the
      // row (its `ended_at`) rather than from the count going quiet.
      await client.rpc('lobby_end', { p_pin: pin });
    }
    if (this.channel && client) {
      await client.removeChannel(this.channel);
    }
    this.channel = null;
    this.currentPin = '';
    this._audienceCount.set(0);
    this._status.set('idle');
  }

  private async open(pin: string, payload: LobbyPayload): Promise<void> {
    const client = await this.supabase.client();
    if (!client) {
      this._status.set('unavailable');
      return;
    }
    this.currentPin = pin;
    this._status.set('connecting');

    const channel = client.channel(channelName(pin), {
      config: { presence: { key: 'host' }, broadcast: { self: false } },
    });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      // Every key that is not the host is a viewer (ADR-0003: audience = viewer
      // Presence on the channel).
      this._audienceCount.set(
        Object.keys(state).filter((key) => key !== 'host').length,
      );
    });
    this.channel = channel;

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Presence now carries only liveness — the payload rides the row and
          // the Broadcast, not a heavy Presence meta.
          void channel.track({ role: 'host' }).then(async () => {
            await this.writeAndBroadcast(payload);
            this._status.set('hosting');
            this.analytics.created(pin, payload.song.id);
            resolve();
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this._status.set('unavailable');
          resolve();
        }
      });
    });
  }
}
