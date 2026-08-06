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
 * Where the app that wrote this file lives.
 *
 * An Achordeon file travels: it is emailed to a bandmate, dropped in a shared
 * folder, found on a disk two years later. Off the strength of `.json` alone it
 * is a wall of records with no way back to the thing that reads them — so every
 * envelope says, in its first line, what opens it.
 *
 * A **constant, not a setting**: it is the app's own address, and a file that
 * pointed at whichever host happened to serve it would send its reader to a
 * preview deployment or to `localhost`.
 */
export const ACHORDEON_URL = 'https://achordeon.eu/app/';

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
  /** `ACHORDEON_URL` — the app this file belongs to, for whoever finds it. Read
   * by nothing: a reader that already understands the envelope does not need to
   * be told, and one that does not is a person. First key in the file, because
   * that is the line a person sees before they scroll. */
  app: string;
  schemaVersion: number; // logical integer; see SCHEMA_VERSION / ADR-0007
  deviceId: string; // which device produced this snapshot (feeds per-row LWW)
  updatedAt: number; // epoch ms the snapshot was produced
  data: SnapshotData;
}
