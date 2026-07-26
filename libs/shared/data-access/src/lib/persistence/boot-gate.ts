// Boot gate state — Epic 11 ▸ forced update path
// Spec: ADR-0007 (one ingest gateway; refuse newer data), PRD-INFRASTRUCTURE §11

import { Injectable, computed, signal } from '@angular/core';
import type { MigrateStatus } from '@achordeon/shared/domain';
import type { BootResult } from './gateway';

/**
 * What the boot-time ingest gateway found in the local database.
 *
 * `bootstrap()` does the work (migrate in place, or refuse); this holds its
 * verdict so the shell can act on it. Two consumers, both cross-cutting:
 *
 * - **`mustUpdate`** — the local data was written by a newer *breaking* build, so
 *   this one cannot read it and must not guess. ADR-0007 makes that failure safe
 *   only because updating is one reload away, and Epic 11's blocking prompt is
 *   that reload. Nothing has been changed on disk; the newer app will still find
 *   its data intact.
 * - **`hasNewerData`** — the data carries setting keys this build doesn't know
 *   (additive from a newer app). Harmless by design (preserve-unknown), and
 *   deliberately *not* a prompt: nothing is broken and nothing is lost.
 *
 * `deviceId` rides along because the same boot read produces it, and per-row LWW
 * (ADR-0004) needs it.
 */
@Injectable({ providedIn: 'root' })
export class BootGate {
  private readonly _status = signal<MigrateStatus | null>(null);
  private readonly _schemaVersion = signal<number | null>(null);
  private readonly _deviceId = signal<string | null>(null);

  /** `null` until the boot initializer has run. */
  readonly status = this._status.asReadonly();
  readonly schemaVersion = this._schemaVersion.asReadonly();
  readonly deviceId = this._deviceId.asReadonly();

  /** The app is older than its own data — it must update before it can read it. */
  readonly mustUpdate = computed(() => this._status() === 'refuse');

  /** The data has been touched by a newer app, additively. Informational. */
  readonly hasNewerData = computed(() => this._status() === 'warn');

  /** Publish the gateway's verdict (called once, from the boot initializer). */
  publish(result: BootResult): void {
    this._status.set(result.status);
    this._schemaVersion.set(result.schemaVersion);
    this._deviceId.set(result.deviceId);
  }

  /**
   * Another ingest path refused newer data — a Drive pull, or an import.
   *
   * Same conclusion as a refusing boot and therefore the same signal: this build
   * cannot read that data, and the only way forward is a newer build. Latching it
   * here rather than in each path is what lets one blocking prompt serve all four
   * paths of ADR-0007.
   */
  refuseIngest(): void {
    this._status.set('refuse');
  }
}

/**
 * Thrown by an ingest path handed a snapshot from a newer *breaking* build.
 *
 * Distinct from a transport failure on purpose: nothing is wrong with the network
 * or the file, and retrying is pointless until the app itself is newer. Callers
 * that show an outcome should say so rather than "failed".
 */
export class SchemaTooNewError extends Error {
  constructor() {
    super('This data was written by a newer version of Achordeon.');
    this.name = 'SchemaTooNewError';
  }
}
