import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import type { Song, Songbook } from '@achordeon/shared/domain';
import { ALL_SONGS_ID, SCHEMA_VERSION } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import {
  SONGBOOK_REPOSITORY,
  SONG_REPOSITORY,
  songPagingConfig,
  songbookPagingConfig,
} from '../stores/repositories';
import { ExportService } from './export-service';
import { ImportError, ImportService } from './import-service';
import { embedSnapshot, readEmbeddedSnapshot } from './embedded-metadata';
import { fileDate, toFileSlug } from './file-io';

function song(id: string, over: Partial<Song> = {}): Song {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: id,
    content: `* ${id}`,
    favorite: false,
    settings: {},
    cache: { title: id, subtitle: '' },
    ...over,
  };
}

function book(id: string, over: Partial<Songbook> = {}): Songbook {
  return {
    id,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    name: id,
    title: '',
    subtitle: '',
    author: '',
    settings: {},
    entries: [],
    ...over,
  };
}

function setup(songs: Song[] = [], books: Songbook[] = []) {
  const songSource = new MemoryEntitySource<Song>(songs);
  const bookSource = new MemoryEntitySource<Songbook>(books);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SONG_REPOSITORY,
        useValue: new PagedRepository(songSource, songPagingConfig),
      },
      {
        provide: SONGBOOK_REPOSITORY,
        useValue: new PagedRepository(bookSource, songbookPagingConfig),
      },
    ],
  });
  return {
    exporter: TestBed.inject(ExportService),
    importer: TestBed.inject(ImportService),
    songSource,
    bookSource,
  };
}

describe('ExportService', () => {
  it('exports exactly what was selected', async () => {
    const { exporter } = setup([song('a'), song('b')]);
    const snapshot = await exporter.snapshot({ songIds: ['a'] });
    expect(snapshot.data.songs.map((s) => s.id)).toEqual(['a']);
    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('drags a songbook’s songs along with it', async () => {
    // Without this the file imports an empty songbook on the one machine that
    // needs it: the one that does not already have the songs.
    const { exporter } = setup(
      [song('a'), song('b')],
      [book('set', { entries: ['a', 'a', 'b'] })],
    );
    const snapshot = await exporter.snapshot({ songbookIds: ['set'] });
    expect(snapshot.data.songs.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(snapshot.data.songbooks[0].entries).toEqual(['a', 'a', 'b']);
  });

  it('exports the whole library for the virtual All songs, as songs and no book', async () => {
    const { exporter } = setup(
      [song('a'), song('b'), song('c', { deletedAt: 5 })],
      [book('set', { entries: ['a'] })],
    );
    const snapshot = await exporter.snapshot({ songbookIds: [ALL_SONGS_ID] });
    // Every live song, and no songbook record — All songs is not one.
    expect(snapshot.data.songs.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(snapshot.data.songbooks).toEqual([]);
  });

  it('carries no user row — a file must not re-base someone’s global defaults', async () => {
    const { exporter } = setup([song('a')]);
    expect((await exporter.snapshot({ songIds: ['a'] })).data.user).toEqual([]);
  });

  it('skips a tombstone and an id that is not there', async () => {
    const { exporter } = setup([song('a', { deletedAt: 5 }), song('b')]);
    const snapshot = await exporter.snapshot({ songIds: ['a', 'b', 'ghost'] });
    expect(snapshot.data.songs.map((s) => s.id)).toEqual(['b']);
  });

  it('names a single-item file after the item, and a bundle just "export"', async () => {
    const { exporter } = setup([song('a', { name: 'Šárka & co' }), song('b')]);
    const one = await exporter.snapshot({ songIds: ['a'] });
    expect(exporter.filename(one)).toBe(
      `achordeon-Sarka-co-${fileDate()}.json`,
    );
    const many = await exporter.snapshot({ songIds: ['a', 'b'] });
    expect(exporter.filename(many)).toBe(`achordeon-export-${fileDate()}.json`);
  });
});

describe('toFileSlug', () => {
  it('falls back rather than producing a file called ".json"', () => {
    expect(toFileSlug('///', 'export')).toBe('export');
  });
});

describe('ImportService', () => {
  const envelope = (songs: Song[], books: Songbook[] = []) =>
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      deviceId: 'other-device',
      updatedAt: 1,
      data: { user: [], songs, songbooks: books },
    });

  it('reads an export back into an envelope', async () => {
    const { importer } = setup();
    const source = await importer.read(new Blob([envelope([song('a')])]));
    expect(source.snapshot.data.songs).toHaveLength(1);
    expect(source.status).toBe('ok');
  });

  it('refuses a file from a newer breaking schema instead of guessing', async () => {
    const { importer } = setup();
    const future = JSON.stringify({
      schemaVersion: SCHEMA_VERSION + 1,
      deviceId: 'x',
      updatedAt: 1,
      data: { user: [], songs: [], songbooks: [] },
    });
    await expect(importer.read(new Blob([future]))).rejects.toMatchObject({
      reason: 'refused',
    });
  });

  it('rejects text that is not a library, at the boundary', async () => {
    const { importer } = setup();
    await expect(importer.read(new Blob(['nonsense']))).rejects.toBeInstanceOf(
      ImportError,
    );
    await expect(importer.read(new Blob(['42']))).rejects.toMatchObject({
      reason: 'unreadable',
    });
  });

  it('plans against the library as it stands', async () => {
    const { importer } = setup([song('a', { name: 'mine' })]);
    const source = await importer.read(new Blob([envelope([song('a')])]));
    const plan = await importer.plan(source.snapshot);
    expect(plan.conflicts).toEqual([
      { id: 'a', incomingName: 'a', existingName: 'mine' },
    ]);
  });

  it('writes songs and songbooks, songs first', async () => {
    const { importer, songSource, bookSource } = setup();
    const source = await importer.read(
      new Blob([envelope([song('a')], [book('set', { entries: ['a'] })])]),
    );
    const write = await importer.apply(await importer.plan(source.snapshot), {
      resolution: 'replace',
    });
    expect(write.songs).toHaveLength(1);
    expect((await songSource.all()).map((s) => s.id)).toEqual(['a']);
    const stored = await bookSource.all();
    expect(stored[0].entries).toEqual(['a']);
    expect(stored[0].id).not.toBe('set'); // always a new songbook
  });

  it('ignoring a conflict leaves the local song exactly as it was', async () => {
    const { importer, songSource } = setup([song('a', { name: 'mine' })]);
    const source = await importer.read(new Blob([envelope([song('a')])]));
    const write = await importer.apply(await importer.plan(source.snapshot), {
      resolution: 'ignore',
    });
    expect(write.ignored).toBe(1);
    expect((await songSource.all())[0].name).toBe('mine');
  });
});

describe('embedded metadata', () => {
  /** The smallest thing that is structurally a PNG: signature, IHDR, IEND. */
  function png(): Blob {
    const chunk = (type: string, data: Uint8Array) => {
      const bytes = new Uint8Array(12 + data.length);
      new DataView(bytes.buffer).setUint32(0, data.length);
      bytes.set(new TextEncoder().encode(type), 4);
      bytes.set(data, 8);
      return bytes;
    };
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', new Uint8Array(13)),
      chunk('IEND', new Uint8Array(0)),
    ];
    return new Blob(parts as BlobPart[], { type: 'image/png' });
  }

  it('round-trips the snapshot JSON through a PNG', async () => {
    const json = '{"schemaVersion":1,"ěščř":"ok"}';
    const embedded = await embedSnapshot(png(), json);
    expect(await readEmbeddedSnapshot(embedded)).toBe(json);
  });

  it('keeps IEND last, so a decoder still sees a whole image', async () => {
    const embedded = await embedSnapshot(png(), '{}');
    const bytes = new Uint8Array(await embedded.arrayBuffer());
    const tail = new TextDecoder('latin1').decode(bytes.subarray(-8, -4));
    expect(tail).toBe('IEND');
  });

  it('leaves a non-PNG alone rather than refusing it', async () => {
    const other = new Blob(['not a png']);
    expect(await embedSnapshot(other, '{}')).toBe(other);
    expect(await readEmbeddedSnapshot(other)).toBeNull();
  });

  it('reports nothing for a PNG that carries no chunk of ours', async () => {
    expect(await readEmbeddedSnapshot(png())).toBeNull();
  });
});
