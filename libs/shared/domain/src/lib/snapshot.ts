// Snapshot envelope + schemaVersion — Epic 1 ▸ subtask 5
// Spec: PRD-INFRASTRUCTURE.md §1/§4, ADR-0007

import type { Song, Songbook, User } from './entities';

/**
 * Logical schema version of the record-content shape carried in every Snapshot.
 * Additive change = no bump; breaking change = bump + refuse-on-newer (ADR-0007).
 * Not the physical Dexie `.version()` — that reshapes stores only.
 */
export const SCHEMA_VERSION = 1;

/**
 * The whole library payload — every table, tombstones (`deletedAt`) included so
 * deletes propagate instead of resurrecting. PRD-INFRASTRUCTURE.md §1/§4.
 */
export interface SnapshotData {
  user: User[];
  songs: Song[];
  songbooks: Songbook[]; // entries stay embedded (not flattened) — PRD-DOMAIN-MODEL.md §Songbook
}

/**
 * The one canonical serialization every boundary crossing translates to/from
 * (Export/Import JSON, Drive backup, Supabase rows, Dexie export). Backends are
 * dumb push/pull targets over this shape. PRD-INFRASTRUCTURE.md §1/§4.
 */
export interface SnapshotEnvelope {
  schemaVersion: number; // logical integer; see SCHEMA_VERSION / ADR-0007
  deviceId: string; // which device produced this snapshot (feeds per-row LWW)
  updatedAt: number; // epoch ms the snapshot was produced
  data: SnapshotData;
}
