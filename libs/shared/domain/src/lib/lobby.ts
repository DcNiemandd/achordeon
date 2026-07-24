// Lobby (Audience) shapes & PIN allocation — Epic 9
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0003 (Realtime Presence)
//
// Pure domain: the wire shape a host tracks into Presence and a viewer renders
// from, plus PIN generation. No `@supabase/*` here — the transport lives in the
// `lobby/` adapter in `shared/data-access` (ADR-0003, ADR-0008). Both host and
// viewer share this one definition so they cannot disagree about the payload.

import type { GlobalSettings } from './settings';
import type { Song } from './entities';

/**
 * The PIN alphabet, deliberately **unambiguous** (ADR-0003): no `0/O`, `1/I/L`.
 * A viewer types this off a screen or reads it aloud, so a character that could
 * be two things is a character that lets them into the wrong lobby.
 */
export const LOBBY_PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** ~5 chars: at this scale, random-without-a-registry collides negligibly (ADR-0003). */
export const LOBBY_PIN_LENGTH = 5;

/**
 * A fresh PIN, random over {@link LOBBY_PIN_ALPHABET}. No dedup registry — there
 * is no central list of live PINs to check against, and a viewer who joins a PIN
 * with no host simply sees "lobby not found" (ADR-0003).
 *
 * `random` is injectable so the allocation is testable; it defaults to
 * `Math.random`. This is a display code, not a secret, so `Math.random` is fine.
 */
export function generateLobbyPin(random: () => number = Math.random): string {
  let pin = '';
  for (let i = 0; i < LOBBY_PIN_LENGTH; i++) {
    pin += LOBBY_PIN_ALPHABET[Math.floor(random() * LOBBY_PIN_ALPHABET.length)];
  }
  return pin;
}

/** One row of the read-only setlist a viewer sees (ADR-0003: travels once). */
export interface LobbySummaryRow {
  readonly index: number;
  readonly name: string;
  readonly title: string;
}

/**
 * The Presence payload a host `track()`s and a viewer renders locally (ADR-0003).
 *
 * It carries the **full** current Song plus its already-resolved render settings,
 * not an id: the viewer has no copy of the host's library and no way to run the
 * host's settings cascade, so the wire has to be self-sufficient. Sending the
 * resolved `settings` (rather than the viewer re-resolving against its own
 * globals) is what makes the viewer's render byte-identical to the host's.
 *
 * `summary` + `currentIndex` are the setlist and where in it the host stands, so
 * the viewer's read-only summary can mark the current song without a second
 * message.
 */
export interface LobbyPayload {
  readonly song: Song;
  readonly settings: GlobalSettings;
  readonly summary: readonly LobbySummaryRow[];
  readonly currentIndex: number;
}

/**
 * A payload stamped with its server-owned revision — the shape that flows over
 * every transport (the durable `lobbies` row, a `postgres_changes` event, a
 * Realtime Broadcast). The viewer keeps the highest `rev` it has applied and
 * ignores anything not newer, so a lost, duplicated or out-of-order update is
 * harmless and all three transports feed one reducer.
 *
 * `rev` is allocated by the database (`lobby_publish`), not the host, so it stays
 * monotonic even when a reloaded host resumes a lobby it no longer remembers.
 */
export interface LobbyUpdate {
  readonly rev: number;
  readonly payload: LobbyPayload;
}
