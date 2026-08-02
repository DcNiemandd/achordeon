import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import type { Song, User } from '@achordeon/shared/domain';
import { AchordeonDb } from '../persistence/db';
import { exportDbBlob } from '../persistence/snapshot-blob';
import { ACHORDEON_DB } from '../stores/repositories';
import { BackupService } from './backup-service';

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

let dbSeq = 0;
const fresh = () => new AchordeonDb(`backup-${dbSeq++}`);

/** A backup file, made the way `BackupService.backup` makes one. */
async function backupOf(rows: {
  songs?: Song[];
  user?: User[];
}): Promise<Blob> {
  const source = fresh();
  await source.songs.bulkPut(rows.songs ?? []);
  await source.user.bulkPut(rows.user ?? []);
  const blob = await exportDbBlob(source);
  await source.delete();
  return blob;
}

function serviceOn(db: AchordeonDb): BackupService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ACHORDEON_DB, useValue: db }],
  });
  return TestBed.inject(BackupService);
}

describe('BackupService.restore', () => {
  describe('merge — add the file beside what is here', () => {
    it('keeps songs the file does not have', async () => {
      const db = fresh();
      await db.songs.put(song('mine'));
      const file = await backupOf({ songs: [song('theirs')] });

      await serviceOn(db).restore(file, 'merge');

      expect((await db.songs.toArray()).map((s) => s.id).sort()).toEqual([
        'mine',
        'theirs',
      ]);
      await db.delete();
    });

    it('keeps the newer copy when both have the row', async () => {
      const db = fresh();
      await db.songs.put(song('a', { updatedAt: 50, name: 'local' }));
      const file = await backupOf({
        songs: [song('a', { updatedAt: 10, name: 'from file' })],
      });

      await serviceOn(db).restore(file, 'merge');

      expect((await db.songs.get('a'))?.name).toBe('local');
      await db.delete();
    });

    it('takes the file copy when it is the newer one', async () => {
      const db = fresh();
      await db.songs.put(song('a', { updatedAt: 10, name: 'local' }));
      const file = await backupOf({
        songs: [song('a', { updatedAt: 50, name: 'from file' })],
      });

      await serviceOn(db).restore(file, 'merge');

      expect((await db.songs.get('a'))?.name).toBe('from file');
      await db.delete();
    });

    // A delete is the newest write to its id (softDelete bumps updatedAt), so it
    // wins by the same rule as an edit — an old backup cannot resurrect a song.
    it('lets a newer tombstone in the file win', async () => {
      const db = fresh();
      await db.songs.put(song('a', { updatedAt: 10 }));
      const file = await backupOf({
        songs: [song('a', { updatedAt: 50, deletedAt: 50 })],
      });

      await serviceOn(db).restore(file, 'merge');

      expect((await db.songs.get('a'))?.deletedAt).toBe(50);
      await db.delete();
    });

    it('leaves the user row alone — a file brings a library, not an identity', async () => {
      const db = fresh();
      await db.user.put(user({ username: 'mine', updatedAt: 1 }));
      const file = await backupOf({
        user: [user({ username: 'theirs', updatedAt: 999 })],
      });

      await serviceOn(db).restore(file, 'merge');

      expect((await db.user.get('user'))?.username).toBe('mine');
      await db.delete();
    });

    it('does not leave its scratch database behind', async () => {
      const db = fresh();
      const file = await backupOf({ songs: [song('a')] });

      await serviceOn(db).restore(file, 'merge');

      const names = await indexedDB.databases();
      expect(
        names.filter((n) => n.name?.startsWith('achordeon-restore-scratch')),
      ).toEqual([]);
      await db.delete();
    });
  });

  describe('replace — put the machine back exactly', () => {
    it('throws away what is not in the file', async () => {
      const db = fresh();
      await db.songs.put(song('mine'));
      const file = await backupOf({ songs: [song('theirs')] });

      await serviceOn(db).restore(file, 'replace');

      expect((await db.songs.toArray()).map((s) => s.id)).toEqual(['theirs']);
      await db.delete();
    });

    it('takes the file’s user row, settings and all', async () => {
      const db = fresh();
      await db.user.put(user({ username: 'mine', updatedAt: 999 }));
      const file = await backupOf({
        user: [user({ username: 'theirs', updatedAt: 1 })],
      });

      await serviceOn(db).restore(file, 'replace');

      expect((await db.user.get('user'))?.username).toBe('theirs');
      await db.delete();
    });
  });
});
