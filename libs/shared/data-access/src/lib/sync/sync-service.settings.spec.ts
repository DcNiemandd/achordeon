// Regression guard: a changed GLOBAL DEFAULT is a synced row, and it reaches the
// cloud on its own. It used to reach it only if some *other* edit happened to
// trigger a cycle first — and the "you have unsynced changes" warning, which is
// what stops the tab closing, never counted it at all.

import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { LOCAL_USER_ID, type SnapshotEnvelope } from '@achordeon/shared/domain';
import { SCHEMA_VERSION } from '@achordeon/shared/domain';
import { AchordeonDb } from '../persistence/db';
import { ACHORDEON_DB } from '../stores/repositories';
import { SettingsStore } from '../stores/settings-store';
import { AuthService } from '../auth/auth-service';
import { SupabaseSyncBackend } from './supabase-backend';
import { DriveSyncBackend } from './drive-backend';
import { SyncService } from './sync-service';

let dbSeq = 0;

/** Poll a condition the service reaches on its own clock (`pushSoon` recounts in
 * the background, deliberately — the UI must not wait on a database read). */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('SyncService — global settings reach the cloud', () => {
  let db: AchordeonDb;
  let pushed: SnapshotEnvelope[];

  async function setup(opts: { pushFails?: boolean } = {}): Promise<{
    sync: SyncService;
    settings: SettingsStore;
  }> {
    db = new AchordeonDb(`sync-settings-${dbSeq++}`);
    pushed = [];

    const authStub = {
      isSignedIn: () => true,
      isPro: () => true,
      user: () => ({ id: 'uid' }),
    };
    const supabaseStub = {
      id: 'supabase' as const,
      pull: async (): Promise<SnapshotEnvelope> => ({
        schemaVersion: SCHEMA_VERSION,
        deviceId: 'supabase',
        updatedAt: 1,
        data: { user: [], songs: [], songbooks: [] },
      }),
      push: async (snapshot: SnapshotEnvelope) => {
        if (opts.pushFails) throw new Error('nope');
        pushed.push(snapshot);
      },
    };
    const driveStub = { id: 'drive' as const };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ACHORDEON_DB, useValue: db },
        { provide: AuthService, useValue: authStub },
        { provide: SupabaseSyncBackend, useValue: supabaseStub },
        { provide: DriveSyncBackend, useValue: driveStub },
      ],
    });
    return {
      sync: TestBed.inject(SyncService),
      settings: TestBed.inject(SettingsStore),
    };
  }

  it('pushes the account row when a global default changes', async () => {
    const { sync, settings } = await setup();
    await sync.init();
    pushed.length = 0;

    await settings.setGlobal({ columns: 3 });
    await sync.flush();

    const rows = pushed.flatMap((p) => p.data.user);
    expect(rows.map((u) => u.id)).toEqual([LOCAL_USER_ID]);
    expect(rows[0].settings.columns).toBe(3);
  });

  it('counts the change as unsynced until the push lands', async () => {
    const { sync, settings } = await setup();
    await sync.init();
    expect(sync.hasUnsynced()).toBe(false); // nothing to send yet

    await settings.setGlobal({ columns: 3 });
    await until(() => sync.hasUnsynced());
    expect(sync.hasUnsynced()).toBe(true);

    await sync.flush();
    expect(sync.hasUnsynced()).toBe(false); // …and the warning clears itself
  });

  it('keeps warning while the push keeps failing', async () => {
    const { sync, settings } = await setup({ pushFails: true });
    await sync.init();

    await settings.setGlobal({ columns: 3 });
    await sync.flush();

    expect(sync.status()).toBe('error');
    expect(sync.hasUnsynced()).toBe(true);
  });

  it('does not push settings for a signed-out library', async () => {
    db = new AchordeonDb(`sync-settings-${dbSeq++}`);
    pushed = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ACHORDEON_DB, useValue: db },
        {
          provide: AuthService,
          useValue: {
            isSignedIn: () => false,
            isPro: () => false,
            user: () => null,
          },
        },
        {
          provide: SupabaseSyncBackend,
          useValue: {
            id: 'supabase' as const,
            pull: async () => null,
            push: async (s: SnapshotEnvelope) => {
              pushed.push(s);
            },
          },
        },
        { provide: DriveSyncBackend, useValue: { id: 'drive' as const } },
      ],
    });
    const sync = TestBed.inject(SyncService);
    const settings = TestBed.inject(SettingsStore);
    await sync.init();

    await settings.setGlobal({ columns: 3 });
    await sync.flush();

    // Local save still happened; the cloud is simply not part of this library.
    expect(pushed).toEqual([]);
    expect(sync.hasUnsynced()).toBe(false);
    expect((await db.user.get(LOCAL_USER_ID))?.settings.columns).toBe(3);
  });
});
