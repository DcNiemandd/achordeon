// Snapshot migration — Epic 1 ▸ subtask 6
// Spec: ADR-0007, PRD-DOMAIN-MODEL.md §Schema evolution

import { SETTINGS } from './settings';
import { SCHEMA_VERSION, type SnapshotEnvelope } from './snapshot';

/**
 * One forward-only step: takes a whole envelope at version `to - 1` and returns
 * it reshaped to version `to`. Labelled by the (breaking) version it produces;
 * position in the chain is not load-bearing — `to` is.
 */
interface Migration {
  to: number;
  apply: (snapshot: SnapshotEnvelope) => SnapshotEnvelope;
}

export type MigrateStatus = 'ok' | 'warn' | 'refuse';

export interface MigrateResult {
  snapshot: SnapshotEnvelope;
  status: MigrateStatus;
}

/**
 * The forward-only chain. One entry per breaking version; additive changes never
 * get a step (old data is already valid — preserve-unknown). Declaration order is
 * NOT load-bearing — steps are indexed by `to` below. Empty at v1.
 */
const MIGRATIONS: Migration[] = [];

/**
 * Steps indexed by the version each produces, so a mis-ordered `MIGRATIONS` array
 * can't cause a silent mis-migration. A duplicate `to` is a developer bug — caught
 * here at load, not as corrupt data later.
 */
const BY_VERSION = new Map(MIGRATIONS.map((m) => [m.to, m]));
if (BY_VERSION.size !== MIGRATIONS.length) {
  throw new Error('Migration chain has duplicate `to` versions.');
}

const KNOWN_SETTING_KEYS = new Set(Object.keys(SETTINGS));

/**
 * Did the incoming data carry setting keys this client doesn't recognise? That is
 * the additive-from-a-newer-app signal — a key we'll preserve but can't render.
 * Scans the registry-backed settings bags (the additive surface, ADR-0006/0007);
 * entity-level field additions are out of scope without a hand-kept manifest.
 */
function hasUnknownKeys(snapshot: SnapshotEnvelope): boolean {
  const bags = [
    ...snapshot.data.user.map((u) => u.settings),
    ...snapshot.data.songs.map((s) => s.settings),
    ...snapshot.data.songbooks.map((s) => s.settings),
  ];
  return bags.some((bag) =>
    Object.keys(bag).some((key) => !KNOWN_SETTING_KEYS.has(key)),
  );
}

/**
 * The single ingest gateway every inbound path funnels through (ADR-0007).
 * Refuses snapshots newer than this client understands; otherwise runs the
 * forward-only chain up to current, stamps the version, and flags whether the
 * data looks like it came from a newer (additive) app.
 */
export function migrate(snapshot: SnapshotEnvelope): MigrateResult {
  // Newer breaking version than we know how to read — never guess a down-migration.
  if (snapshot.schemaVersion > SCHEMA_VERSION) {
    return { snapshot, status: 'refuse' };
  }

  // Walk the version line one step at a time, up to current. A missing step is a
  // gap in the chain (developer bug), not a data condition — fail loud, don't skip.
  let migrated = snapshot;
  for (let v = snapshot.schemaVersion + 1; v <= SCHEMA_VERSION; v++) {
    const step = BY_VERSION.get(v);
    if (!step) {
      throw new Error(`Migration chain is missing a step to v${v}.`);
    }
    migrated = step.apply(migrated);
  }

  // Bump: the reshaped envelope now advertises the shape it actually holds.
  migrated = { ...migrated, schemaVersion: SCHEMA_VERSION };

  const status: MigrateStatus = hasUnknownKeys(snapshot) ? 'warn' : 'ok';
  return { snapshot: migrated, status };
}
