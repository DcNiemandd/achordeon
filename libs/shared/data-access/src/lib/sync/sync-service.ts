// SyncService — Epic 10 ▸ orchestration behind the SyncBackend port
// Spec: PRD-INFRASTRUCTURE.md §5, ADR-0004 (aggressive local save + coarse
// boundary push + pull-on-launch/focus + warn-if-unsynced).
//
// The one place that knows *when* to sync and *how* to reconcile. Backends move
// bytes; this holds the watermark, runs the per-row LWW merge (domain), reflects
// a pull back into the stores, and raises the load-bearing "unsynced" flag. Local
// autosave to IndexedDB is never gated on any of this — cloud sync is strictly
// additive, so an unconfigured or signed-out app behaves exactly as before.

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  migrate,
  mergeSnapshots,
  type SnapshotData,
  type SnapshotEnvelope,
} from '@achordeon/shared/domain';
import { AuthService } from '../auth/auth-service';
import { BootGate, SchemaTooNewError } from '../persistence/boot-gate';
import { snapshotFromDb } from '../persistence/gateway';
import { ACHORDEON_DB } from '../stores/repositories';
import { SongStore } from '../stores/song-store';
import { SongbookStore } from '../stores/songbook-store';
import { SettingsStore } from '../stores/settings-store';
import { SupabaseSyncBackend } from './supabase-backend';
import { DriveSyncBackend } from './drive-backend';

const META_AUTO_SYNC = 'autoSync';
const META_WATERMARK = 'syncedAt:supabase';

/** How long a boundary push coalesces edits (ADR-0004: coarse, not per-keystroke).
 * A save, a reorder and an app-blur landing together fire one sync, not three. */
const PUSH_DEBOUNCE_MS = 3000;

export type SyncStatus = 'idle' | 'syncing' | 'error';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly supabaseBackend = inject(SupabaseSyncBackend);
  private readonly driveBackend = inject(DriveSyncBackend);
  private readonly auth = inject(AuthService);
  private readonly db = inject(ACHORDEON_DB);
  private readonly songs = inject(SongStore);
  private readonly songbooks = inject(SongbookStore);
  private readonly settings = inject(SettingsStore);
  /** Where "this app is older than the data it was handed" is latched (ADR-0007). */
  private readonly boot = inject(BootGate);

  private readonly _status = signal<SyncStatus>('idle');
  private readonly _lastError = signal<unknown>(null);
  private readonly _autoSync = signal(false);
  private readonly _hasUnsynced = signal(false);

  readonly status = this._status.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  /** The user's toggle. Being `pro` enables it; it can be switched off without
   * signing out (ADR-0004). */
  readonly autoSync = this._autoSync.asReadonly();
  /** Local changes that have not reached the cloud for a sync-on user — the
   * warn-before-leaving signal (there is no live channel to catch up the other
   * device). */
  readonly hasUnsynced = this._hasUnsynced.asReadonly();

  /** Automatic Supabase sync is live right now — signed in, paid, toggle on. */
  readonly isActive = computed(
    () => this.auth.isSignedIn() && this.auth.isPro() && this._autoSync(),
  );

  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /**
   * Load the toggle, wire the handoff moments (pull on focus, flush on blur), and
   * do a first pull. Called once at boot, after `AuthService.init`.
   */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const stored = await this.db.meta.get(META_AUTO_SYNC);
    // Default follows the tier: a fresh paid user gets automatic sync without
    // having to find the switch; free stays off (nothing to sync to).
    this._autoSync.set(stored ? stored.value === 'on' : this.auth.isPro());

    await this.recomputeUnsynced();

    // A changed global default is a synced row like a saved song, so it is a push
    // boundary like a saved song (ADR-0004). Without this a preference reached the
    // cloud only when some *other* edit happened to trigger a cycle — and the
    // "unsynced" flag stayed stale in the meantime, since nothing recounted.
    this.settings.onSaved(() => this.pushSoon());

    if (typeof window !== 'undefined') {
      // The handoff moment: the other device opening is when a pull matters.
      window.addEventListener('focus', () => void this.syncNow());
      // Leaving is the last chance to get local work to the cloud.
      window.addEventListener('blur', () => void this.flush());
    }

    await this.syncNow();
  }

  /** A meaningful boundary reached (editor save/close, reorder commit) — schedule
   * a coalesced push. Cheap to call often; it debounces. */
  pushSoon(): void {
    void this.recomputeUnsynced();
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.syncNow(), PUSH_DEBOUNCE_MS);
  }

  /** Push immediately, cancelling any pending debounce (app blur/close). */
  async flush(): Promise<void> {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    await this.syncNow();
  }

  /**
   * One full automatic-sync cycle: pull remote changes and merge them in, then
   * push local changes out. No-op unless sync is active. Serialised — a second
   * call while one runs is dropped, since the running one already covers "now".
   */
  async syncNow(): Promise<void> {
    if (!this.isActive() || this._status() === 'syncing') return;
    this._status.set('syncing');
    this._lastError.set(null);
    try {
      const runStart = Date.now();
      const watermark = await this.readWatermark();
      const local = await snapshotFromDb(this.db);

      const remote = this.ingest(await this.supabaseBackend.pull(watermark));
      if (remote !== null) {
        const merged = mergeSnapshots(local.data, remote.data);
        await this.applyToDb(merged);
        await this.reflectInStores(merged);
      }

      const changed = changedSince(local.data, watermark);
      if (hasRows(changed)) {
        await this.supabaseBackend.push({ ...local, data: changed });
      }

      await this.writeWatermark(runStart);
      this._status.set('idle');
      await this.recomputeUnsynced();
    } catch (e) {
      this._status.set('error');
      this._lastError.set(e);
      // Nothing landed, so "unsynced" is whatever the rows say — not whatever the
      // last cycle that *did* land left behind. Turning sync on and having the
      // very first cycle fail is the case: the watermark was reset to 0, so every
      // row is unsynced, and without this the flag would still read false.
      try {
        await this.recomputeUnsynced();
      } catch {
        // The local database is unreadable too; leave the flag where it was.
      }
    }
  }

  // --- Manual Drive (all users, two buttons) --------------------------------

  /**
   * "Upload to Drive": write the whole library, non-destructively. The existing
   * Drive copy is pulled and merged into the local snapshot first (per-row LWW,
   * the same rule the auto/download paths use), so an upload can never drop rows
   * that live only in the Drive backup — another device's edits we never pulled.
   * The uploaded file is always a superset, so `force` is moot on the happy path;
   * it stays wired for the conflict UI. A missing token throws through as before.
   */
  async driveUpload(opts: { force?: boolean } = {}): Promise<void> {
    const local = await this.driveBackend.snapshot();
    const remote = this.ingest(await this.driveBackend.pull());
    const data =
      remote === null ? local.data : mergeSnapshots(local.data, remote.data);
    await this.driveBackend.upload({ ...local, data }, opts);
  }

  /**
   * "Download from Drive": pull the whole file and merge it in (per-row LWW, the
   * same rule the auto path uses). Returns false if there is no file yet.
   */
  async driveDownload(): Promise<boolean> {
    const remote = this.ingest(await this.driveBackend.pull());
    if (remote === null) return false;
    const local = await snapshotFromDb(this.db);
    const merged = mergeSnapshots(local.data, remote.data);
    await this.applyToDb(merged);
    await this.reflectInStores(merged);
    await this.recomputeUnsynced();
    return true;
  }

  // --- Toggle ---------------------------------------------------------------

  async setAutoSync(on: boolean): Promise<void> {
    this._autoSync.set(on);
    await this.db.meta.put({ key: META_AUTO_SYNC, value: on ? 'on' : 'off' });
    if (on) {
      // Turning sync ON means "get my whole library up there now", not "sync
      // what changed since some past watermark". Reset the watermark to 0 so the
      // cycle pushes EVERY local row (and pulls every remote one) — a full
      // two-way fuse. Without this, a stale watermark from an earlier cycle
      // leaves the existing library behind and only new edits ever upload.
      await this.writeWatermark(0);
      await this.syncNow();
    } else {
      await this.recomputeUnsynced();
    }
  }

  // --- internals ------------------------------------------------------------

  /**
   * The ADR-0007 gateway on the two cloud paths: **every** inbound envelope is
   * migrated before a single row of it is read, and one written by a newer
   * breaking build is refused rather than guessed at.
   *
   * A refusal latches `BootGate` (which raises the blocking update prompt) and
   * throws, so the caller cannot accidentally carry on with the un-migrated
   * snapshot. Merging is per-row LWW, which would have happily fused rows of a
   * shape this build does not understand — silent loss, the exact failure ADR-0007
   * exists to prevent.
   *
   * The Supabase path assembles its envelope from typed columns and stamps it at
   * the current version, so it cannot refuse today; it goes through here anyway,
   * because the day that stops being true is the day this is needed.
   */
  private ingest(remote: SnapshotEnvelope | null): SnapshotEnvelope | null {
    if (remote === null) return null;
    const { snapshot, status } = migrate(remote);
    if (status === 'refuse') {
      this.boot.refuseIngest();
      throw new SchemaTooNewError();
    }
    return snapshot;
  }

  /** Upsert merged rows into the local tables (no clear — the merge already
   * reconciled everything, so this is a plain write-through). */
  private async applyToDb(data: SnapshotData): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.user,
      this.db.songs,
      this.db.songbooks,
      async () => {
        await Promise.all([
          this.db.user.bulkPut(data.user),
          this.db.songs.bulkPut(data.songs),
          this.db.songbooks.bulkPut(data.songbooks),
        ]);
      },
    );
  }

  /** Reflect a just-merged snapshot into the running stores so the UI updates
   * without a reload — the windowed lists re-query, settings re-hydrate. */
  private async reflectInStores(data: SnapshotData): Promise<void> {
    await Promise.all([this.songs.refresh(), this.songbooks.refresh()]);
    const user = data.user.find((u) => u.deletedAt === null);
    if (user) {
      // The All songs order rides along: it lives on the same account row and is
      // the one preference whose whole point is that the other device agrees. A
      // row that predates the field leaves it undefined, and `hydrate` skips what
      // it is not given rather than resetting it to the default.
      this.settings.hydrate({
        global: user.settings,
        allSongsOrder: user.allSongsOrder,
      });
    }
  }

  private async recomputeUnsynced(): Promise<void> {
    if (!this.isActive()) {
      this._hasUnsynced.set(false);
      return;
    }
    const watermark = await this.readWatermark();
    const local = await snapshotFromDb(this.db);
    this._hasUnsynced.set(hasRows(changedSince(local.data, watermark)));
  }

  private async readWatermark(): Promise<number> {
    const row = await this.db.meta.get(META_WATERMARK);
    return row ? Number(row.value) : 0;
  }

  private async writeWatermark(at: number): Promise<void> {
    await this.db.meta.put({ key: META_WATERMARK, value: String(at) });
  }
}

/** The rows in a snapshot whose local edit is newer than the watermark — the set
 * a push sends and the set the unsynced warning counts. */
export function changedSince(data: SnapshotData, since: number): SnapshotData {
  return {
    user: data.user.filter((r) => r.updatedAt > since),
    songs: data.songs.filter((r) => r.updatedAt > since),
    songbooks: data.songbooks.filter((r) => r.updatedAt > since),
  };
}

function hasRows(data: SnapshotData): boolean {
  return (
    data.user.length > 0 || data.songs.length > 0 || data.songbooks.length > 0
  );
}
