// DriveSyncBackend — Epic 10 ▸ manual Google Drive backup (all users)
// Spec: PRD-INFRASTRUCTURE.md §6, ADR-0009 (Drive rides the Google identity).
//
// Two explicit buttons, never automatic (§6): whole-file last-write-wins is
// unsafe to auto-direct, so the human picks which copy wins. One visible file,
// `achordeon-backup.json`, under the non-sensitive `drive.file` scope — it IS the
// export JSON and survives an app-revoke. The Google `provider_token` is gone
// after any reload (§6); when it is missing this throws `DriveAuthRequiredError`
// and the caller re-runs the OAuth flow (Flow A).

import {
  ACHORDEON_URL,
  SCHEMA_VERSION,
  type SnapshotEnvelope,
} from '@achordeon/shared/domain';
import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { readDeviceId } from '../persistence/gateway';
import { ACHORDEON_DB } from '../stores/repositories';
import type { SyncBackend } from './sync-backend';

/** The one Drive file the whole library lives in (§6). */
export const DRIVE_FILE_NAME = 'achordeon-backup.json';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** No usable Google token — the caller re-runs `signInWithGoogle(withDrive)`. */
export class DriveAuthRequiredError extends Error {
  constructor() {
    super('Google Drive access has expired. Reconnect to continue.');
    this.name = 'DriveAuthRequiredError';
  }
}

/** The Drive file moved ahead of what we last saw — overwriting it would drop a
 * change made elsewhere. The UI warns and offers to force (§6 guard). */
export class DriveConflictError extends Error {
  constructor(readonly driveModifiedTime: string) {
    super('The Drive backup has changed since you last synced.');
    this.name = 'DriveConflictError';
  }
}

interface DriveFileMeta {
  id: string;
  modifiedTime: string;
}

@Injectable({ providedIn: 'root' })
export class DriveSyncBackend implements SyncBackend {
  readonly id = 'drive' as const;

  private readonly auth = inject(AuthService);
  private readonly db = inject(ACHORDEON_DB);

  /** The `modifiedTime` of the file as we last read/wrote it — the guard baseline. */
  private lastSeenModifiedTime: string | null = null;

  /** Whole-file pull. `since` is ignored — Drive holds the whole library. */
  async pull(): Promise<SnapshotEnvelope | null> {
    const token = this.token();
    const file = await this.find(token);
    if (file === null) return null;
    this.lastSeenModifiedTime = file.modifiedTime;
    const res = await fetch(`${DRIVE_FILES}/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw await driveError(res);
    return (await res.json()) as SnapshotEnvelope;
  }

  /** Port `push`: the manual button forces after its own warn, so the plain
   * contract writes unconditionally. The guarded path is `upload`. */
  push(snapshot: SnapshotEnvelope): Promise<void> {
    return this.upload(snapshot, { force: true });
  }

  /**
   * Upload the whole library, guarding against a Drive copy that moved ahead.
   * With `force` the guard is skipped (the user chose to overwrite after the
   * warning). Creates the file on the first push, PATCHes it thereafter.
   */
  async upload(
    snapshot: SnapshotEnvelope,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    const token = this.token();
    const existing = await this.find(token);

    if (
      existing !== null &&
      !opts.force &&
      this.lastSeenModifiedTime !== null &&
      existing.modifiedTime !== this.lastSeenModifiedTime
    ) {
      throw new DriveConflictError(existing.modifiedTime);
    }

    const body = JSON.stringify(snapshot);
    const written =
      existing === null
        ? await this.create(token, body)
        : await this.patch(token, existing.id, body);
    this.lastSeenModifiedTime = written.modifiedTime;
  }

  /** Assemble the outbound envelope from the live database — the whole file,
   * tombstones and all. Used by the manual "Upload to Drive" button. */
  async snapshot(): Promise<SnapshotEnvelope> {
    const [deviceId, user, songs, songbooks] = await Promise.all([
      readDeviceId(this.db),
      this.db.user.toArray(),
      this.db.songs.toArray(),
      this.db.songbooks.toArray(),
    ]);
    return {
      app: ACHORDEON_URL,
      schemaVersion: SCHEMA_VERSION,
      deviceId,
      updatedAt: Date.now(),
      data: { user, songs, songbooks },
    };
  }

  // --- Drive REST -----------------------------------------------------------

  private async find(token: string): Promise<DriveFileMeta | null> {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const url = `${DRIVE_FILES}?q=${q}&spaces=drive&fields=files(id,modifiedTime)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw await driveError(res);
    const body = (await res.json()) as { files?: DriveFileMeta[] };
    return body.files?.[0] ?? null;
  }

  private async create(token: string, json: string): Promise<DriveFileMeta> {
    // Multipart: metadata part + the JSON media part, in one request.
    const boundary = `achordeon-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: DRIVE_FILE_NAME,
      mimeType: 'application/json',
    });
    const multipart =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      `${json}\r\n` +
      `--${boundary}--`;
    const res = await fetch(
      `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,modifiedTime`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );
    if (!res.ok) throw await driveError(res);
    return (await res.json()) as DriveFileMeta;
  }

  private async patch(
    token: string,
    id: string,
    json: string,
  ): Promise<DriveFileMeta> {
    const res = await fetch(
      `${DRIVE_UPLOAD}/${id}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: json,
      },
    );
    if (!res.ok) throw await driveError(res);
    return (await res.json()) as DriveFileMeta;
  }

  private token(): string {
    const token = this.auth.providerToken();
    if (token === null) throw new DriveAuthRequiredError();
    return token;
  }
}

/** A 401 means the token lapsed → route to re-auth; anything else is a real
 * failure carrying Drive's own message. */
async function driveError(res: Response): Promise<Error> {
  if (res.status === 401 || res.status === 403)
    return new DriveAuthRequiredError();
  const text = await res.text().catch(() => '');
  return new Error(`Drive request failed (${res.status}): ${text}`);
}
