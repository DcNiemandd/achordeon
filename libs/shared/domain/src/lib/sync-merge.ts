// Per-row last-write-wins merge — Epic 10 ▸ Sync mechanics
// Spec: PRD-INFRASTRUCTURE.md §5 ("Conflict = per-row last-write-wins"), ADR-0004.
//
// Pure and framework-free so it can be tested in isolation and reused by every
// boundary that reconciles two Snapshots — Supabase pull, Drive pull, Import.
// The whole sync model (ADR-0004) rests on this being correct: sequential
// device handoff means edits do not overlap, so the newer `updatedAt` is always
// the one the user meant to keep.

import type { BaseRecord } from './entities';
import type { SnapshotData } from './snapshot';

/**
 * Reconcile two versions of one table by id, keeping the row with the greater
 * `updatedAt`.
 *
 * A tombstone is not special-cased: `softDelete` bumps `updatedAt` when it sets
 * `deletedAt`, so a delete is simply the newest write to that row and wins by the
 * same rule as any edit — which is what lets a delete propagate instead of a
 * stale live copy resurrecting it.
 *
 * **Ties keep `local`.** A row present on both sides with an identical
 * `updatedAt` is the same row; preferring local avoids a pointless write-back and
 * keeps the merge stable (merging twice changes nothing).
 */
export function mergeRecords<T extends BaseRecord>(
  local: readonly T[],
  remote: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of local) {
    byId.set(row.id, row);
  }
  for (const row of remote) {
    const mine = byId.get(row.id);
    if (mine === undefined || row.updatedAt > mine.updatedAt) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/**
 * Merge two whole-library snapshots table by table (per-row LWW). The result is
 * what a pull writes back locally and, symmetrically, what a push has to send —
 * both sides converge on the same set because the operation is commutative on
 * `updatedAt`.
 */
export function mergeSnapshots(
  local: SnapshotData,
  remote: SnapshotData,
): SnapshotData {
  return {
    user: mergeRecords(local.user, remote.user),
    songs: mergeRecords(local.songs, remote.songs),
    songbooks: mergeRecords(local.songbooks, remote.songbooks),
  };
}
