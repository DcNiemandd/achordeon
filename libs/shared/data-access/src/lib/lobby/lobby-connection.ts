// Lobby connection health — Epic 8/9 follow-up ▸ surviving a frozen tab
// Spec: ADR-0011 (durable lobby state — the row is what makes healing safe)
//
// A performance lasts an evening; a websocket in a backgrounded tab does not. A
// phone that locks between songs, or a tab the OS freezes, has its socket closed
// under it — and because a frozen tab runs no timers and gets no events, nothing
// in either lobby service notices. What comes back is a `RealtimeChannel` object
// that looks fine and delivers nothing: the host publishes into a channel nobody
// is joined to, and the viewer sits on the song the performer left three songs
// ago.
//
// Both sides need the same three questions answered — "did this tab just wake
// up", "did the network just come back", and "is my channel actually still
// joined" — so they are answered once, here.

import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * How often a live lobby re-checks its own channel while the tab is awake.
 *
 * The wake events cover suspension, which is the loud failure; this covers the
 * quiet one — a venue's wifi dropping while the screen is on, where the socket
 * reconnects but the channel may not rejoin. It only ever costs a string
 * comparison, because a joined channel needs nothing done to it.
 */
const WATCHDOG_MS = 30_000;

/**
 * Is this channel genuinely joined?
 *
 * `state` is a `CHANNEL_STATES` enum, and importing the enum's *value* would
 * pull `@supabase/supabase-js` into the initial bundle — the one thing this
 * folder exists to prevent (ADR-0008). Its members are their own strings, so the
 * comparison is made against the string.
 */
export function isChannelJoined(channel: RealtimeChannel | null): boolean {
  return channel !== null && String(channel.state) === 'joined';
}

/**
 * Calls `heal` whenever this tab might have missed something: it became visible
 * again, the network came back, or the watchdog came round.
 *
 * The listeners are registered once and never removed — the two services that
 * own one are root-scoped and live as long as the document. `heal` is expected to
 * be cheap and to return immediately when there is no lobby, which is why it can
 * be called unconditionally. `arm`/`disarm` bracket only the polling, so an app
 * that never hosts or joins carries no timer.
 */
export class LobbyWake {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly heal: () => void) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.heal();
    });
    window.addEventListener('online', () => this.heal());
  }

  arm(): void {
    this.timer ??= setInterval(() => this.heal(), WATCHDOG_MS);
  }

  disarm(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
