// Regression guard: turning on Supabase sync FUSES the local and remote
// libraries — it never clears the local database. Locks in the property the
// user relies on (non-destructive sync): `bulkPut` only adds/updates by key, so
// a local row absent from the remote survives, a shared row takes the newer
// version (LWW), and a remote-only row is pulled in.

import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import {
  ACHORDEON_URL,
  SCHEMA_VERSION,
  type SnapshotEnvelope,
} from '@achordeon/shared/domain';
import type { Song } from '@achordeon/shared/domain';
import { AchordeonDb } from '../persistence/db';
import { ACHORDEON_DB } from '../stores/repositories';
import { AuthService } from '../auth/auth-service';
import { SupabaseSyncBackend } from './supabase-backend';
import { DriveSyncBackend } from './drive-backend';
import { SyncService } from './sync-service';

function song(id: string, over: Partial<Song> = {}): Song {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: id,
    content: '',
    favorite: false,
    settings: {},
    cache: { title: '', subtitle: '' },
    ...over,
  };
}

let dbSeq = 0;

function remoteEnvelope(songs: Song[]): SnapshotEnvelope {
  return {
    app: ACHORDEON_URL,
    schemaVersion: SCHEMA_VERSION,
    deviceId: 'supabase',
    updatedAt: Date.now(),
    data: { user: [], songs, songbooks: [] },
  };
}

describe('SyncService — non-destructive fuse on enable', () => {
  let db: AchordeonDb;
  let pushed: SnapshotEnvelope[];

  async function setup(remote: Song[]): Promise<SyncService> {
    db = new AchordeonDb(`sync-fuse-${dbSeq++}`);
    pushed = [];

    const authStub = {
      isSignedIn: () => true,
      isPro: () => true,
      user: () => ({ id: 'uid' }),
    };
    const supabaseStub = {
      id: 'supabase' as const,
      pull: async () => remoteEnvelope(remote),
      push: async (snapshot: SnapshotEnvelope) => {
        pushed.push(snapshot);
      },
    };
    const driveStub = { id: 'drive' as const };

    TestBed.configureTestingModule({
      providers: [
        { provide: ACHORDEON_DB, useValue: db },
        { provide: AuthService, useValue: authStub },
        { provide: SupabaseSyncBackend, useValue: supabaseStub },
        { provide: DriveSyncBackend, useValue: driveStub },
      ],
    });
    return TestBed.inject(SyncService);
  }

  it('keeps local-only rows, takes the newer shared row, and pulls remote-only rows', async () => {
    // Local has A and B (older); remote has B (newer) and C.
    const sync = await setup([
      song('B', { updatedAt: 20, name: 'B-remote' }),
      song('C', { updatedAt: 5, name: 'C-remote' }),
    ]);
    await db.songs.bulkPut([
      song('A', { updatedAt: 10, name: 'A-local' }),
      song('B', { updatedAt: 10, name: 'B-local' }),
    ]);

    await sync.setAutoSync(true); // enables + runs one full cycle

    const after = (await db.songs.toArray()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(after.map((s) => s.id)).toEqual(['A', 'B', 'C']); // union, nothing lost
    expect(after.find((s) => s.id === 'A')?.name).toBe('A-local'); // local-only kept
    expect(after.find((s) => s.id === 'B')?.name).toBe('B-remote'); // newer wins (LWW)
    expect(after.find((s) => s.id === 'C')?.name).toBe('C-remote'); // remote pulled in
  });

  it('never clears the local database when the remote is empty', async () => {
    const sync = await setup([]);
    await db.songs.bulkPut([song('A'), song('B')]);

    await sync.setAutoSync(true);

    const ids = (await db.songs.toArray()).map((s) => s.id).sort();
    expect(ids).toEqual(['A', 'B']); // an empty remote takes nothing away
  });

  it('pushes the local rows up as part of the fuse', async () => {
    const sync = await setup([]);
    await db.songs.bulkPut([song('A', { updatedAt: 10 })]);

    await sync.setAutoSync(true);

    const sentIds = pushed.flatMap((p) => p.data.songs.map((s) => s.id));
    expect(sentIds).toContain('A');
  });

  it('uploads the WHOLE library on enable, even past a stale watermark', async () => {
    const sync = await setup([]);
    // A watermark from an earlier cycle, ahead of every existing row.
    await db.meta.put({ key: 'syncedAt:supabase', value: String(Date.now()) });
    await db.songs.bulkPut([
      song('A', { updatedAt: 10 }),
      song('B', { updatedAt: 20 }),
    ]);

    await sync.setAutoSync(true);

    // Turning sync on means "get my whole library up now" — both existing rows
    // upload, not just ones edited after the stale watermark (which is none).
    const sentIds = pushed.flatMap((p) => p.data.songs.map((s) => s.id)).sort();
    expect(sentIds).toEqual(['A', 'B']);
  });
});
