// Boot ingest gateway — Epic 4 ▸ subtask 6
// Spec: ADR-0007 (one ingest gateway; migrate in place, persist at current, bump),
// PRD-INFRASTRUCTURE.md §4

import {
  SCHEMA_VERSION,
  type MigrateStatus,
  type SnapshotEnvelope,
  migrate,
} from '@achordeon/shared/domain';
import type { AchordeonDb } from './db';

const META_SCHEMA_VERSION = 'schemaVersion';
const META_DEVICE_ID = 'deviceId';

/**
 * The logical `schemaVersion` last persisted locally. A fresh DB (no stamp) is by
 * definition at the current shape — it has never held older-shaped data. The stamp
 * is written on the first boot so a future breaking bump correctly sees pre-bump
 * data as behind, not as current.
 */
async function readSchemaVersion(db: AchordeonDb): Promise<number> {
  const row = await db.meta.get(META_SCHEMA_VERSION);
  return row ? Number(row.value) : SCHEMA_VERSION;
}

/** This install's stable device id (feeds per-row LWW, ADR-0004); minted once.
 * Exported because every outbound envelope carries it — Export (Epic 7) as much
 * as sync (Epic 10). */
export async function readDeviceId(db: AchordeonDb): Promise<string> {
  const row = await db.meta.get(META_DEVICE_ID);
  if (row) return row.value;
  const id = crypto.randomUUID();
  await db.meta.put({ key: META_DEVICE_ID, value: id });
  return id;
}

/**
 * Assemble the whole local library into one Snapshot envelope — every table,
 * tombstones included (deletes must propagate). Carries the *stored* schemaVersion
 * so the migrator knows how far behind the data is.
 */
export async function snapshotFromDb(
  db: AchordeonDb,
): Promise<SnapshotEnvelope> {
  const [schemaVersion, deviceId, user, songs, songbooks] = await Promise.all([
    readSchemaVersion(db),
    readDeviceId(db),
    db.user.toArray(),
    db.songs.toArray(),
    db.songbooks.toArray(),
  ]);
  return {
    schemaVersion,
    deviceId,
    updatedAt: Date.now(),
    data: { user, songs, songbooks },
  };
}

/**
 * Replace the local tables with a migrated snapshot and stamp its version — the
 * "persist at current, bump" half of the boot flow. Full replace is correct here
 * because the payload is this device's own data reshaped; conflict-resolved merges
 * for *external* snapshots (import/Drive/Supabase) are a later concern (Epic 7/10).
 */
export async function writeSnapshotToDb(
  db: AchordeonDb,
  snapshot: SnapshotEnvelope,
): Promise<void> {
  await db.transaction(
    'rw',
    db.user,
    db.songs,
    db.songbooks,
    db.meta,
    async () => {
      await Promise.all([
        db.user.clear(),
        db.songs.clear(),
        db.songbooks.clear(),
      ]);
      await Promise.all([
        db.user.bulkPut(snapshot.data.user),
        db.songs.bulkPut(snapshot.data.songs),
        db.songbooks.bulkPut(snapshot.data.songbooks),
      ]);
      await db.meta.put({
        key: META_SCHEMA_VERSION,
        value: String(snapshot.schemaVersion),
      });
    },
  );
}

export interface BootResult {
  status: MigrateStatus;
  schemaVersion: number;
  deviceId: string;
}

/**
 * The gateway in front of the local boot load (ADR-0007). Runs the shared, tested
 * `migrate()` over the local snapshot before any store reads a row:
 *
 * - **refuse** — data was written by a newer breaking build; leave it untouched and
 *   let the caller trigger the forced update (PRD §11). Never guess a down-migration.
 * - **behind** — run the forward-only chain, then persist at current and bump the
 *   stamp, so runtime code only ever sees the current shape (one-time cost).
 * - **current** — no rewrite; just ensure the version is stamped. `warn` still
 *   surfaces if the data carries unknown (additive-from-newer) keys.
 */
export async function bootstrap(db: AchordeonDb): Promise<BootResult> {
  const deviceId = await readDeviceId(db);
  const stored = await readSchemaVersion(db);
  const snapshot = await snapshotFromDb(db);
  const { snapshot: migrated, status } = migrate(snapshot);

  if (status === 'refuse') {
    return { status, schemaVersion: stored, deviceId };
  }

  if (migrated.schemaVersion !== stored) {
    await writeSnapshotToDb(db, migrated); // migrate in place, persist, bump
  } else {
    // Nothing to reshape — just make sure the stamp exists (first boot of a fresh DB).
    await db.meta.put({
      key: META_SCHEMA_VERSION,
      value: String(migrated.schemaVersion),
    });
  }

  return { status, schemaVersion: migrated.schemaVersion, deviceId };
}
