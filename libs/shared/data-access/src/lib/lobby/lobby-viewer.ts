// Lobby viewer — Epic 9 ▸ subtask 3, 5; durable-state follow-up
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0011 (durable lobby state,
// supersedes ADR-0003's Presence-only design).
//
// The audience's side. The durable `lobbies` row is the source of truth: the
// viewer reads it on join for the current song, then follows it through Realtime.
// Three transports feed ONE reducer, gated by a monotonic `rev`:
//   - the join-time row read (and any manual re-read — `requestSync`),
//   - `postgres_changes` on the row (the durable stream),
//   - a Broadcast of the same `{ rev, payload }` (the low-latency nudge).
// Because every update is reduced by `rev`, a lost, duplicated or out-of-order
// event is harmless — the worst case self-heals on the next event or a re-read.
// Presence is used only for the live audience count.
//
// A viewer also **heals on waking** (`resume`, driven by `LobbyWake`): a phone in
// a pocket for most of a set has missed every event in between, so becoming
// visible re-reads the row and re-joins the channel if the socket went with it.
// The manual Re-sync button is the same act, asked for by hand.

import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LobbyPayload, LobbyUpdate } from '@achordeon/shared/domain';
import { SupabaseService } from './supabase-client';
import { LobbyWake, isChannelJoined } from './lobby-connection';

export type LobbyViewerStatus =
  | 'idle' // not joined
  | 'connecting' // subscribing, no lobby seen yet
  | 'joined' // lobby live, payload flowing
  | 'not-found' // subscribed but no lobby on this PIN
  | 'ended' // the host ended the lobby
  | 'unavailable'; // no backend configured, or the socket failed

/** How long to wait for a lobby row to appear before calling a PIN dead. */
const NOT_FOUND_GRACE_MS = 4000;

function channelName(pin: string): string {
  return `lobby:${pin}`;
}

function randomViewerKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `viewer-${uuid ?? Math.random().toString(36).slice(2)}`;
}

/** The columns a viewer reads from a lobby row. */
interface LobbyRow {
  rev: number;
  payload: LobbyPayload;
  ended_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class LobbyViewer {
  private readonly supabase = inject(SupabaseService);

  private channel: RealtimeChannel | null = null;
  private currentPin = '';
  /**
   * This viewer's Presence key, minted once per join and **reused on a re-join**:
   * a fresh key would be counted as a second viewer for as long as the old entry
   * took to expire, so a lobby's count would climb every time a phone woke up.
   */
  private viewerKey = randomViewerKey();
  /** The highest rev applied — the reducer's gate across all three transports. */
  private appliedRev = -1;
  /** True once any lobby row (live or ended) has been seen for this PIN. */
  private sawLobby = false;
  private notFoundTimer: ReturnType<typeof setTimeout> | null = null;
  private isResuming = false;

  /**
   * The automatic half of Re-sync. A viewer's phone is in a pocket for most of a
   * set, and the tab that comes back has missed every event in between — so
   * waking up re-reads the row (and re-joins the channel if the socket went with
   * it) rather than waiting for the viewer to notice they are on the wrong song
   * and press the button.
   */
  private readonly wake = new LobbyWake(() => void this.resume());

  private readonly _payload = signal<LobbyPayload | null>(null);
  /** The current-song payload for this lobby, or `null`. */
  readonly payload = this._payload.asReadonly();

  private readonly _status = signal<LobbyViewerStatus>('idle');
  readonly status = this._status.asReadonly();

  private readonly _audienceCount = signal(0);
  /** Live viewers on the channel (this viewer included). */
  readonly audienceCount = this._audienceCount.asReadonly();

  /** Join the lobby at `pin`. Leaves any previous channel first. */
  async join(pin: string): Promise<void> {
    await this.leave();
    this.currentPin = pin;
    this.viewerKey = randomViewerKey();
    this._status.set('connecting');
    await this.subscribe(pin);
  }

  /**
   * Open a channel on `pin` and start following the row.
   *
   * Split out of `join` so a re-join after a suspension can reuse it **without**
   * resetting anything: `appliedRev`, the payload on screen and the `joined`
   * status all stand. Clearing them would blank the song the viewer is reading
   * while the socket comes back, and re-applying the row from `rev` -1 would
   * re-render it a moment later — a flicker in the middle of a repair.
   */
  private async subscribe(pin: string): Promise<void> {
    const client = await this.supabase.client();
    if (!client) {
      this._status.set('unavailable');
      return;
    }
    this.wake.arm();

    const channel = client.channel(channelName(pin), {
      config: {
        presence: { key: this.viewerKey },
        broadcast: { self: false },
      },
    });
    // The low-latency nudge: the host's own Broadcast of the change.
    channel.on('broadcast', { event: 'song' }, (message) => {
      this.applyUpdate(message['payload'] as LobbyUpdate);
    });
    // The durable stream: every write to this lobby's row.
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lobbies',
        filter: `pin=eq.${pin}`,
      },
      (message) => this.applyRow(message.new as LobbyRow),
    );
    channel.on('presence', { event: 'sync' }, () => this.onSync(channel));
    this.channel = channel;

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ role: 'viewer' });
        // Read the current state only AFTER the subscription is live, so a change
        // that lands during setup arrives as a postgres_changes event rather than
        // being missed between a read and a not-yet-open subscription.
        void this.readRow(pin).then(() => this.armNotFound());
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this._status.set('unavailable');
      }
    });
  }

  /** Leave the lobby and reset to idle. */
  async leave(): Promise<void> {
    this.clearNotFound();
    this.wake.disarm();
    await this.dropChannel();
    this.currentPin = '';
    this.appliedRev = -1;
    this.sawLobby = false;
    this._payload.set(null);
    this._audienceCount.set(0);
    this._status.set('idle');
  }

  /**
   * Catch up after this tab was away — the automatic Re-sync.
   *
   * A joined channel needs only a re-read: the row is the truth and the rev gate
   * makes applying it idempotent, so a viewer already on the current song sees
   * nothing happen. A channel that is no longer joined is dropped and re-opened
   * first, because a re-read alone would leave the next page turn undelivered.
   */
  async resume(): Promise<void> {
    const pin = this.currentPin;
    if (pin === '' || this.isResuming) return;
    this.isResuming = true;
    try {
      if (!isChannelJoined(this.channel)) {
        await this.dropChannel();
        await this.subscribe(pin);
        return;
      }
      await this.readRow(pin);
    } finally {
      this.isResuming = false;
    }
  }

  /** Let go of the channel without resetting what the viewer is reading. */
  private async dropChannel(): Promise<void> {
    const client = await this.supabase.client();
    if (this.channel && client) {
      await client.removeChannel(this.channel);
    }
    this.channel = null;
  }

  /**
   * Re-read the durable row and apply it — the manual "sync" button, and the
   * recovery path a viewer takes if it ever suspects it fell behind. Idempotent:
   * a row no newer than what is already shown changes nothing (the rev gate).
   */
  async requestSync(): Promise<void> {
    if (this.currentPin !== '') {
      await this.readRow(this.currentPin);
    }
  }

  /** SELECT the lobby row for `pin` and fold it into the reducer. */
  private async readRow(pin: string): Promise<void> {
    const client = await this.supabase.client();
    if (!client || pin !== this.currentPin) return;
    const { data, error } = await client
      .from('lobbies')
      .select('rev,payload,ended_at')
      .eq('pin', pin)
      .maybeSingle();
    // A read error or a still-absent row is left to the grace timer / the
    // postgres_changes stream — not treated as "ended".
    if (error || !data) return;
    this.applyRow(data as LobbyRow);
  }

  /** Fold a whole row (from a read or a postgres_changes event) into the reducer. */
  private applyRow(row: LobbyRow): void {
    this.sawLobby = true;
    this.clearNotFound();
    if (row.ended_at !== null) {
      // Ending is a state change, not a newer song — it carries no fresh rev, so
      // it is handled outside the rev gate.
      this._payload.set(null);
      this._status.set('ended');
      return;
    }
    this.applyUpdate({ rev: row.rev, payload: row.payload });
  }

  /** The core reducer: apply a stamped payload only if it is strictly newer. */
  private applyUpdate(update: LobbyUpdate | null): void {
    if (!update || update.rev <= this.appliedRev) return;
    this.appliedRev = update.rev;
    this.sawLobby = true;
    this.clearNotFound();
    this._payload.set(update.payload);
    this._status.set('joined');
  }

  private onSync(channel: RealtimeChannel): void {
    const state = channel.presenceState();
    this._audienceCount.set(
      Object.keys(state).filter((key) => key !== 'host').length,
    );
  }

  /** Start the "no lobby on this PIN" countdown, unless one has already appeared. */
  private armNotFound(): void {
    if (this.sawLobby || this.notFoundTimer !== null) return;
    this.notFoundTimer = setTimeout(() => {
      if (!this.sawLobby) this._status.set('not-found');
    }, NOT_FOUND_GRACE_MS);
  }

  private clearNotFound(): void {
    if (this.notFoundTimer !== null) {
      clearTimeout(this.notFoundTimer);
      this.notFoundTimer = null;
    }
  }
}
