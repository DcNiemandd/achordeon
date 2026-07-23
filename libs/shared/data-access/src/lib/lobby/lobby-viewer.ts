// Lobby viewer — Epic 9 ▸ subtask 3, 5
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0003 (Realtime Presence)
//
// The audience's side. Subscribes to `lobby:<PIN>`, tracks itself as a viewer so
// it counts toward the audience, and reads the host's Presence entry — which
// *is* the render payload (ADR-0003). `onPresenceSync` delivers the current song
// immediately on join, so a late joiner never sits on a blank screen waiting for
// the next song change.
//
// The host's tab is authoritative: when it disconnects, its Presence entry is
// evicted and the next sync tells us the lobby ended.

import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LobbyPayload } from '@achordeon/shared/domain';
import { SupabaseService } from './supabase-client';

export type LobbyViewerStatus =
  | 'idle' // not joined
  | 'connecting' // subscribing, no host seen yet
  | 'joined' // host present, payload flowing
  | 'not-found' // subscribed but no host on this PIN
  | 'ended' // host was here and disconnected
  | 'unavailable'; // no backend configured, or the socket failed

/** How long to wait for a host to appear before calling a PIN dead. */
const NOT_FOUND_GRACE_MS = 4000;

function channelName(pin: string): string {
  return `lobby:${pin}`;
}

function randomViewerKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `viewer-${uuid ?? Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class LobbyViewer {
  private readonly supabase = inject(SupabaseService);

  private channel: RealtimeChannel | null = null;
  private sawHost = false;
  private notFoundTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _payload = signal<LobbyPayload | null>(null);
  /** The current-song payload the host is broadcasting, or `null`. */
  readonly payload = this._payload.asReadonly();

  private readonly _status = signal<LobbyViewerStatus>('idle');
  readonly status = this._status.asReadonly();

  private readonly _audienceCount = signal(0);
  /** Live viewers on the channel (this viewer included). */
  readonly audienceCount = this._audienceCount.asReadonly();

  /** Join the lobby at `pin`. Leaves any previous channel first. */
  async join(pin: string): Promise<void> {
    await this.leave();
    const client = await this.supabase.client();
    if (!client) {
      this._status.set('unavailable');
      return;
    }
    this._status.set('connecting');
    this.sawHost = false;

    const channel = client.channel(channelName(pin), {
      config: { presence: { key: randomViewerKey() } },
    });
    channel.on('presence', { event: 'sync' }, () => this.onSync(channel));
    this.channel = channel;

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ role: 'viewer' });
        // A PIN with no host still subscribes fine; the "wrong PIN" verdict is
        // "no host showed up in a reasonable window", not a channel error.
        this.notFoundTimer = setTimeout(() => {
          if (!this.sawHost) this._status.set('not-found');
        }, NOT_FOUND_GRACE_MS);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this._status.set('unavailable');
      }
    });
  }

  /** Leave the lobby and reset to idle. */
  async leave(): Promise<void> {
    if (this.notFoundTimer !== null) {
      clearTimeout(this.notFoundTimer);
      this.notFoundTimer = null;
    }
    const client = await this.supabase.client();
    if (this.channel && client) {
      await client.removeChannel(this.channel);
    }
    this.channel = null;
    this.sawHost = false;
    this._payload.set(null);
    this._audienceCount.set(0);
    this._status.set('idle');
  }

  private onSync(channel: RealtimeChannel): void {
    const state = channel.presenceState();
    this._audienceCount.set(
      Object.keys(state).filter((key) => key !== 'host').length,
    );

    // The host's Presence meta *is* the payload (plus a `presence_ref` the SDK
    // adds, which the payload shape ignores).
    const hostEntry = state['host']?.[0] as unknown as LobbyPayload | undefined;
    if (hostEntry) {
      this.sawHost = true;
      if (this.notFoundTimer !== null) {
        clearTimeout(this.notFoundTimer);
        this.notFoundTimer = null;
      }
      this._payload.set(hostEntry);
      this._status.set('joined');
    } else if (this.sawHost) {
      // Host was here and is gone — the lobby ended (ADR-0003).
      this._payload.set(null);
      this._status.set('ended');
    }
  }
}
