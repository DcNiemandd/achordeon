// SyncBackend port — Epic 10 ▸ one port, two backends
// Spec: PRD-INFRASTRUCTURE.md §1/§5, ADR-0004, ADR-0008 (third-party behind a port).
//
// Both cloud targets — manual Drive (all users) and automatic Supabase (paid) —
// are dumb push/pull mirrors of the SAME Snapshot (§1). The orchestration
// (watermark, per-row LWW merge, when to fire) lives ONCE in `SyncService`; a
// backend only knows how to move an envelope to and from its store.

import type { SnapshotEnvelope } from '@achordeon/shared/domain';

export type SyncBackendId = 'supabase' | 'drive';

export interface SyncBackend {
  readonly id: SyncBackendId;

  /**
   * Fetch remote state changed strictly after `since` (epoch-ms). A row-level
   * backend (Supabase) filters on it; a whole-file backend (Drive) ignores it and
   * returns the entire file. `null` means "nothing to pull" — no backend, not
   * signed in, or no file yet.
   */
  pull(since: number): Promise<SnapshotEnvelope | null>;

  /**
   * Write the given records to the remote. The caller has already narrowed
   * `snapshot.data` to the rows worth sending (a row-level backend upserts them;
   * a whole-file backend writes the merged whole).
   */
  push(snapshot: SnapshotEnvelope): Promise<void>;

  // `subscribe` (live inbound deltas) is a future no-op — handoff sync pulls on
  // launch/focus, it does not hold a live channel (ADR-0004). Left off the port
  // until the concurrent-multi-device upgrade actually needs it.
}
