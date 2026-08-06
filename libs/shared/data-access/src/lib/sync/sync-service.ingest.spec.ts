// The ADR-0007 gateway on the cloud paths — Epic 11 ▸ forced update.
//
// A pull carrying a NEWER breaking schemaVersion must be refused, not merged. The
// merge is per-row LWW, which would happily fuse rows of a shape this build does
// not understand and then write them back stripped — the silent-loss failure
// ADR-0007 exists to prevent. Refusing is the safe failure, and it is only humane
// because the refusal raises the blocking update prompt (PRD-INFRASTRUCTURE §11).

import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import {
  ACHORDEON_URL,
  SCHEMA_VERSION,
  type SnapshotEnvelope,
  type Song,
} from '@achordeon/shared/domain';
import { AchordeonDb } from '../persistence/db';
import { BootGate } from '../persistence/boot-gate';
import { ACHORDEON_DB } from '../stores/repositories';
import { AuthService } from '../auth/auth-service';
import { SupabaseSyncBackend } from './supabase-backend';
import { DriveSyncBackend } from './drive-backend';
import { SyncService } from './sync-service';

function song(id: string): Song {
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
  };
}

function envelope(schemaVersion: number, songs: Song[]): SnapshotEnvelope {
  return {
    app: ACHORDEON_URL,
    schemaVersion,
    deviceId: 'elsewhere',
    updatedAt: 2,
    data: { user: [], songs, songbooks: [] },
  };
}

let dbSeq = 0;

describe('SyncService — refusing data from a newer build', () => {
  let db: AchordeonDb;
  let gate: BootGate;

  function setup(remote: SnapshotEnvelope): SyncService {
    db = new AchordeonDb(`sync-ingest-${dbSeq++}`);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ACHORDEON_DB, useValue: db },
        {
          provide: AuthService,
          useValue: {
            isSignedIn: () => true,
            isPro: () => true,
            user: () => ({ id: 'uid' }),
          },
        },
        {
          provide: SupabaseSyncBackend,
          useValue: {
            id: 'supabase' as const,
            pull: async () => remote,
            push: async () => undefined,
          },
        },
        {
          provide: DriveSyncBackend,
          useValue: {
            id: 'drive' as const,
            pull: async () => remote,
            snapshot: async () => envelope(SCHEMA_VERSION, []),
            upload: async () => undefined,
          },
        },
      ],
    });
    gate = TestBed.inject(BootGate);
    return TestBed.inject(SyncService);
  }

  it('drops a Drive download rather than merging a shape it cannot read', async () => {
    const sync = setup(envelope(SCHEMA_VERSION + 1, [song('remote-only')]));
    await db.songs.put(song('local'));

    await expect(sync.driveDownload()).rejects.toThrow(
      /newer version of Achordeon/,
    );

    // Nothing landed, and nothing local was touched.
    expect((await db.songs.toArray()).map((s) => s.id)).toEqual(['local']);
    expect(gate.mustUpdate()).toBe(true);
  });

  it('refuses before an upload can fold the newer file into what it writes back', async () => {
    const sync = setup(envelope(SCHEMA_VERSION + 1, [song('remote-only')]));

    await expect(sync.driveUpload()).rejects.toThrow(
      /newer version of Achordeon/,
    );
    expect(gate.mustUpdate()).toBe(true);
  });

  it('stops an automatic cycle at the pull, and says why', async () => {
    const sync = setup(envelope(SCHEMA_VERSION + 1, []));

    await sync.setAutoSync(true); // runs a full cycle; the pull refuses

    expect(sync.status()).toBe('error');
    expect(gate.mustUpdate()).toBe(true);
  });

  it('merges data at the current version as usual', async () => {
    const sync = setup(envelope(SCHEMA_VERSION, [song('remote-only')]));
    await db.songs.put(song('local'));

    expect(await sync.driveDownload()).toBe(true);

    const ids = (await db.songs.toArray()).map((s) => s.id).sort();
    expect(ids).toEqual(['local', 'remote-only']);
    expect(gate.mustUpdate()).toBe(false);
  });
});
