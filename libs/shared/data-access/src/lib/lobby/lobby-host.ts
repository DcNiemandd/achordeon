// Lobby host — Epic 9 ▸ subtask 1, 5, 6
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0003 (Realtime Presence)
//
// The performer's side of a lobby. Root-scoped **on purpose**: the performance
// is persistent (Epic 8), so the host may navigate to another module while
// hosting and the channel must outlive the `/stage/:id` route. A route-scoped
// owner would drop the socket the moment the performer glanced at their library.
//
// The host `track()`s the full current-song payload into Presence; a song change
// re-`track()`s the new one. Presence's connection lifecycle *is* the lobby's:
// when the host tab disconnects, its entry is evicted and every viewer sees the
// lobby end — no cleanup job, no database (ADR-0003).

import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LobbyPayload } from '@achordeon/shared/domain';
import { SupabaseService } from './supabase-client';
import { LobbyAnalytics } from './lobby-analytics';

export type LobbyHostStatus =
  | 'idle' // no lobby
  | 'connecting' // channel subscribing
  | 'hosting' // live, tracking a payload
  | 'unavailable'; // no backend configured, or the socket failed

/** `lobby:<PIN>` — one channel per PIN (ADR-0003). */
function channelName(pin: string): string {
  return `lobby:${pin}`;
}

@Injectable({ providedIn: 'root' })
export class LobbyHost {
  private readonly supabase = inject(SupabaseService);
  private readonly analytics = inject(LobbyAnalytics);

  private channel: RealtimeChannel | null = null;
  private currentPin = '';

  private readonly _audienceCount = signal(0);
  /** Live viewers on the channel — Presence, minus the host's own entry. */
  readonly audienceCount = this._audienceCount.asReadonly();

  private readonly _status = signal<LobbyHostStatus>('idle');
  readonly status = this._status.asReadonly();

  /**
   * Make the lobby match `(pin, payload)`. The one method the presenter's effect
   * calls: opens the channel the first time (or when the PIN changes), and on
   * every subsequent song change **both** re-tracks Presence and Broadcasts the
   * new payload.
   *
   * Why both (ADR-0003 says "re-tracks **or** Broadcasts"): a Presence `track()`
   * update is delivered to a *late joiner*'s first sync, but Realtime does **not**
   * push a meta-update diff to viewers already subscribed — their Presence cache
   * stays on the payload they joined with. So Presence keeps the current state
   * available for new joiners, and a Broadcast pushes the change to the ones
   * already here.
   */
  async sync(pin: string, payload: LobbyPayload): Promise<void> {
    if (pin !== this.currentPin) {
      await this.close();
      await this.open(pin, payload);
      return;
    }
    if (this.channel) {
      await this.channel.track(payload);
      await this.channel.send({
        type: 'broadcast',
        event: 'song',
        payload,
      });
      this.analytics.songChanged(pin, payload.song.id);
    }
  }

  /** Retire the lobby: remove the channel so every viewer's Presence sync drops it. */
  async close(): Promise<void> {
    const client = await this.supabase.client();
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
          void channel.track(payload).then(() => {
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
