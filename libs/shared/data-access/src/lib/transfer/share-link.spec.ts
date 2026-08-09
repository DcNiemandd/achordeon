import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import {
  APP_BASE_HREF,
  LocationStrategy,
  PathLocationStrategy,
} from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import {
  ACHORDEON_URL,
  SCHEMA_VERSION,
  type Song,
} from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import {
  SONGBOOK_REPOSITORY,
  SONG_REPOSITORY,
  songPagingConfig,
  songbookPagingConfig,
} from '../stores/repositories';
import { provideAchordeonData } from '../providers';
import { ImportService } from './import-service';
import { ShareLinkService } from './share-link-service';
import {
  SHARE_LINK_COMPRESSED,
  SHARE_LINK_PLAIN,
  fromShareLink,
  toShareLink,
} from './share-link';

const envelope = {
  app: ACHORDEON_URL,
  schemaVersion: SCHEMA_VERSION,
  data: {
    songs: [
      {
        id: '9f6b2c14-3d5e-4a71-9c08-1b2e5d7a4f36',
        name: 'Wild Mountain Thyme',
        content: '* Wild Mountain Thyme\n\nOh the [G]summer time is [C]coming',
      },
    ],
    songbooks: [],
  },
};

function importer(existing: Song[] = []): ImportService {
  TestBed.configureTestingModule({
    providers: [
      ...provideAchordeonData(),
      {
        provide: SONG_REPOSITORY,
        useValue: new PagedRepository(
          new MemoryEntitySource<Song>(existing),
          songPagingConfig,
        ),
      },
      {
        provide: SONGBOOK_REPOSITORY,
        useValue: new PagedRepository(
          new MemoryEntitySource([]),
          songbookPagingConfig,
        ),
      },
    ],
  });
  return TestBed.inject(ImportService);
}

describe('share link', () => {
  it('round-trips an envelope through the compressed form', async () => {
    const json = JSON.stringify(envelope);
    const url = await toShareLink(json, ACHORDEON_URL);
    expect(url.startsWith(`${ACHORDEON_URL}#${SHARE_LINK_COMPRESSED}=`)).toBe(
      true,
    );
    const blob = await fromShareLink(new URL(url).hash);
    expect(JSON.parse(await (blob as Blob).text())).toEqual(envelope);
  });

  it('costs far less than the plain form — the whole reason for gzip', async () => {
    // Roughly halves a song, which is what makes a QR code possible later: one
    // tops out near 3KB, where plain JSON for a song runs 3–5KB.
    const verse =
      '[Am]Oh the summer time is [C]coming\nAnd the [G]trees are sweetly [D]blooming\n';
    const json = JSON.stringify({
      ...envelope,
      data: {
        ...envelope.data,
        songs: [{ ...envelope.data.songs[0], content: verse.repeat(20) }],
      },
    });
    const compressed = (await toShareLink(json, '')).length;
    const plain = encodeURIComponent(json).length;
    expect(compressed).toBeLessThan(plain / 2);
  });

  it('reads the plain form a model can actually write', async () => {
    // A model cannot produce gzip: it is a byte-level transform with no reasoning
    // in it, and one asked for it emits a plausible string that decodes to
    // nothing. This is the form the published schema tells a writer to use.
    const fragment = `#${SHARE_LINK_PLAIN}=${encodeURIComponent(JSON.stringify(envelope))}`;
    const blob = await fromShareLink(fragment);
    expect(JSON.parse(await (blob as Blob).text())).toEqual(envelope);
  });

  it('keeps a plus sign in the plain form', async () => {
    // `URLSearchParams` applies FORM decoding and would turn this into a space,
    // quietly corrupting any song with a `+` in it.
    const payload = {
      app: ACHORDEON_URL,
      schemaVersion: SCHEMA_VERSION,
      data: { songs: [{ name: 'C+G', content: 'x' }], songbooks: [] },
    };
    const fragment = `#${SHARE_LINK_PLAIN}=${encodeURIComponent(JSON.stringify(payload))}`;
    const blob = await fromShareLink(fragment);
    expect(JSON.parse(await (blob as Blob).text()).data.songs[0].name).toBe(
      'C+G',
    );
  });

  it('branches on the parameter, never on the bytes', async () => {
    // Two writers, one reader: which parameter carries the payload is the whole
    // of the decision, so a third encoding can arrive later without guesswork.
    const compressed = await toShareLink(JSON.stringify(envelope), '');
    await expect(fromShareLink(compressed)).resolves.toBeInstanceOf(Blob);
  });

  it('says nothing about a fragment that is not a share link', async () => {
    for (const fragment of ['', '#', '#/songs/abc', '#section-2', '#a=b']) {
      await expect(fromShareLink(fragment)).resolves.toBeNull();
    }
  });

  it('fails loudly on a payload that does not decode', async () => {
    // Truncated by a chat client and corrupt are indistinguishable, and have the
    // same answer — the "could not be imported" dialog.
    await expect(
      fromShareLink(`#${SHARE_LINK_COMPRESSED}=not-gzip-at-all`),
    ).rejects.toBeDefined();
  });
});

describe('ShareLinkService', () => {
  function service(baseHref: string): ShareLinkService {
    TestBed.configureTestingModule({
      providers: [
        ...provideAchordeonData(),
        provideLocationMocks(),
        { provide: APP_BASE_HREF, useValue: baseHref },
        { provide: LocationStrategy, useClass: PathLocationStrategy },
        {
          provide: SONG_REPOSITORY,
          useValue: new PagedRepository(
            new MemoryEntitySource<Song>([
              {
                id: 'a',
                createdAt: 1,
                updatedAt: 1,
                deletedAt: null,
                name: 'Shared',
                content: '* Shared',
                favorite: false,
                settings: {},
                cache: { title: 'Shared', subtitle: '' },
              },
            ]),
            songPagingConfig,
          ),
        },
        {
          provide: SONGBOOK_REPOSITORY,
          useValue: new PagedRepository(
            new MemoryEntitySource([]),
            songbookPagingConfig,
          ),
        },
      ],
    });
    return TestBed.inject(ShareLinkService);
  }

  it('points at the app doing the sharing, not at the published address', async () => {
    // `ACHORDEON_URL` is the address a FILE carries — it travels, and must not
    // name whichever host wrote it. A link is the opposite: it is opened, so a
    // link copied on localhost that pointed at production would send the reader
    // somewhere their song does not exist.
    const { url } = await service('/app/').build({ songIds: ['a'] });
    expect(url.startsWith(`${location.origin}/app/#`)).toBe(true);
    expect(url).not.toContain(ACHORDEON_URL);
  });

  it('folds in whatever deploy base the app is actually served under', async () => {
    const { url } = await service('/preview/two/').build({ songIds: ['a'] });
    expect(url.startsWith(`${location.origin}/preview/two/#`)).toBe(true);
  });

  it('reads back as the song that left', async () => {
    const { url } = await service('/app/').build({ songIds: ['a'] });
    const blob = await fromShareLink(new URL(url).hash);
    const envelope = JSON.parse(await (blob as Blob).text());
    expect(envelope.data.songs[0].name).toBe('Shared');
  });
});

describe('the round trip that matters', () => {
  it('a link built here opens as the song that left', async () => {
    // One test over the encoder, the reader, `normalise`, `migrate` and
    // `planImport` — the whole path a shared song takes.
    const url = await toShareLink(JSON.stringify(envelope), ACHORDEON_URL);
    const blob = await fromShareLink(new URL(url).hash);
    const service = importer();
    const source = await service.read(blob as Blob);
    const plan = await service.plan(source.snapshot);

    expect(plan.songs).toHaveLength(1);
    expect(plan.songs[0]).toMatchObject({
      id: envelope.data.songs[0].id,
      name: 'Wild Mountain Thyme',
      content: envelope.data.songs[0].content,
    });
    // The cache was never in the link and is derived on arrival.
    expect(plan.songs[0].cache.title).toBe('Wild Mountain Thyme');
  });

  it('the uuid travels, so passing a song back and forth replaces', async () => {
    const url = await toShareLink(JSON.stringify(envelope), ACHORDEON_URL);
    const blob = await fromShareLink(new URL(url).hash);
    const service = importer([
      {
        id: envelope.data.songs[0].id,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        name: 'my copy',
        content: 'x',
        favorite: false,
        settings: {},
        cache: { title: '', subtitle: '' },
      },
    ]);
    const source = await service.read(blob as Blob);
    expect((await service.plan(source.snapshot)).conflicts).toEqual([
      {
        id: envelope.data.songs[0].id,
        incomingName: 'Wild Mountain Thyme',
        existingName: 'my copy',
      },
    ]);
  });
});
