// "Download from Drive" is a restore, and asks the same question a backup file
// does — Add beside what is here, or Replace it. See SyncService.driveDownload.

import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import {
  SCHEMA_VERSION,
  type SnapshotEnvelope,
  type Song,
  type User,
} from '@achordeon/shared/domain';
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

function user(over: Partial<User> = {}): User {
  return {
    id: 'user',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    username: 'mine',
    planCache: 'free',
    settings: {},
    ...over,
  };
}

function envelope(songs: Song[], users: User[] = []): SnapshotEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId: 'elsewhere',
    updatedAt: 2,
    data: { user: users, songs, songbooks: [] },
  };
}

let dbSeq = 0;
let db: AchordeonDb;

function setup(remote: SnapshotEnvelope): SyncService {
  db = new AchordeonDb(`drive-restore-${dbSeq++}`);
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
          pull: async () => null,
          push: async () => undefined,
        },
      },
      {
        provide: DriveSyncBackend,
        useValue: {
          id: 'drive' as const,
          pull: async () => remote,
          snapshot: async () => envelope([]),
          upload: async () => undefined,
        },
      },
    ],
  });
  return TestBed.inject(SyncService);
}

afterEach(async () => {
  await db?.delete();
});

describe('SyncService.driveDownload', () => {
  it('reports an empty Drive rather than writing anything', async () => {
    const sync = setup(envelope([]));
    (
      TestBed.inject(DriveSyncBackend) as unknown as { pull: () => unknown }
    ).pull = async () => null;

    expect(await sync.driveDownload('merge')).toBe(false);
  });

  describe('merge', () => {
    it('keeps what Drive does not have', async () => {
      const sync = setup(envelope([song('theirs')]));
      await db.songs.put(song('mine'));

      await sync.driveDownload('merge');

      expect((await db.songs.toArray()).map((s) => s.id).sort()).toEqual([
        'mine',
        'theirs',
      ]);
    });

    it('leaves the user row alone, however new the Drive copy is', async () => {
      const sync = setup(
        envelope([], [user({ username: 'theirs', updatedAt: 999 })]),
      );
      await db.user.put(user({ username: 'mine', updatedAt: 1 }));

      await sync.driveDownload('merge');

      expect((await db.user.get('user'))?.username).toBe('mine');
    });

    // The rule every other boundary reconciles by, unchanged by the choice.
    it('still takes the newer song from Drive', async () => {
      const sync = setup(
        envelope([song('a', { updatedAt: 99, name: 'newer' })]),
      );
      await db.songs.put(song('a', { updatedAt: 1, name: 'older' }));

      await sync.driveDownload('merge');

      expect((await db.songs.get('a'))?.name).toBe('newer');
    });
  });

  describe('replace', () => {
    it('throws away what is not in the Drive copy', async () => {
      const sync = setup(envelope([song('theirs')]));
      await db.songs.put(song('mine'));

      await sync.driveDownload('replace');

      expect((await db.songs.toArray()).map((s) => s.id)).toEqual(['theirs']);
    });

    it('takes the Drive user row, settings and all', async () => {
      const sync = setup(
        envelope([], [user({ username: 'theirs', updatedAt: 1 })]),
      );
      await db.user.put(user({ username: 'mine', updatedAt: 999 }));

      await sync.driveDownload('replace');

      expect((await db.user.get('user'))?.username).toBe('theirs');
    });
  });
});
