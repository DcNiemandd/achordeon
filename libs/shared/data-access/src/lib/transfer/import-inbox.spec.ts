import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { SCHEMA_VERSION, type Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import {
  SONGBOOK_REPOSITORY,
  SONG_REPOSITORY,
  songPagingConfig,
  songbookPagingConfig,
} from '../stores/repositories';
import { provideAchordeonData } from '../providers';
import { ImportInbox } from './import-inbox';
import { SHARE_LINK_PLAIN } from './share-link';

/** A hand-written envelope holding one named song — the shortest valid file. */
function file(name: string): Blob {
  return new Blob([json(name)]);
}

function json(name: string): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    data: { songs: [{ name, content: `* ${name}` }], songbooks: [] },
  });
}

function setup(existing: Song[] = []) {
  const source = new MemoryEntitySource<Song>(existing);
  TestBed.configureTestingModule({
    providers: [
      ...provideAchordeonData(),
      {
        provide: SONG_REPOSITORY,
        useValue: new PagedRepository(source, songPagingConfig),
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
  return { inbox: TestBed.inject(ImportInbox), source };
}

describe('ImportInbox', () => {
  it('previews a single file without writing anything', async () => {
    const { inbox, source } = setup();
    await inbox.offer([file('Thyme')]);
    expect(inbox.item()?.plan.songs).toHaveLength(1);
    expect(inbox.remaining()).toBe(0);
    expect(await source.all()).toEqual([]);
  });

  it('takes several files one after another, in order', async () => {
    // Sequential is not only the calmer UI, it is the only correct order:
    // `planImport` computes conflicts against the library as it stands, so the
    // second file cannot be planned until the first is applied.
    const { inbox, source } = setup();
    await inbox.offer([file('one'), file('two'), file('three')]);

    expect(inbox.item()?.plan.songs[0].name).toBe('one');
    expect(inbox.remaining()).toBe(2);

    await inbox.confirm({ resolution: 'replace' });
    expect(inbox.item()?.plan.songs[0].name).toBe('two');
    expect((await source.all()).map((s) => s.name)).toEqual(['one']);

    await inbox.confirm({ resolution: 'replace' });
    await inbox.confirm({ resolution: 'replace' });
    expect(inbox.isOpen()).toBe(false);
    expect((await source.all()).map((s) => s.name).sort()).toEqual([
      'one',
      'three',
      'two',
    ]);
  });

  it('cancel means "not this one" — the queue moves on', async () => {
    const { inbox, source } = setup();
    await inbox.offer([file('one'), file('two')]);
    await inbox.skip();
    expect(inbox.item()?.plan.songs[0].name).toBe('two');
    await inbox.confirm({ resolution: 'replace' });
    expect((await source.all()).map((s) => s.name)).toEqual(['two']);
  });

  it('"cancel all" drops this one and everything still waiting', async () => {
    const { inbox, source } = setup();
    await inbox.offer([file('one'), file('two'), file('three')]);
    inbox.cancelAll();
    expect(inbox.isOpen()).toBe(false);
    expect(inbox.remaining()).toBe(0);
    expect(await source.all()).toEqual([]);
  });

  it('a file that is not one of ours fails without stopping the rest', async () => {
    const { inbox, source } = setup();
    await inbox.offer([new Blob(['nonsense']), file('two')]);
    expect(inbox.failure()).toBe('unreadable');
    expect(inbox.remaining()).toBe(1);
    await inbox.skip();
    expect(inbox.failure()).toBeNull();
    await inbox.confirm({ resolution: 'replace' });
    expect((await source.all()).map((s) => s.name)).toEqual(['two']);
  });

  it('opens a link’s payload as if it were a file', async () => {
    const { inbox } = setup();
    const fragment = `#${SHARE_LINK_PLAIN}=${encodeURIComponent(json('linked'))}`;
    await expect(inbox.offerLink(fragment)).resolves.toBe(true);
    expect(inbox.item()?.plan.songs[0].name).toBe('linked');
  });

  it('will not run the same payload twice', async () => {
    // A restored session, or a router event that fires again for a URL already
    // read, must not re-offer an import the user has already answered.
    const { inbox } = setup();
    const fragment = `#${SHARE_LINK_PLAIN}=${encodeURIComponent(json('linked'))}`;
    await inbox.offerLink(fragment);
    inbox.cancelAll();
    await expect(inbox.offerLink(fragment)).resolves.toBe(false);
    expect(inbox.isOpen()).toBe(false);
  });

  it('stays silent on a fragment that is not a share link', async () => {
    const { inbox } = setup();
    await expect(inbox.offerLink('#/songs/abc')).resolves.toBe(false);
    expect(inbox.isOpen()).toBe(false);
  });

  it('a link that does not decode gets the same dialog a bad file gets', async () => {
    const { inbox } = setup();
    await expect(inbox.offerLink('#z1=not-gzip-at-all')).resolves.toBe(true);
    expect(inbox.failure()).toBe('unreadable');
  });

  describe('saying what arrived, not just how much', () => {
    /** An envelope whose songs carry the content given, verbatim. */
    const withContent = (...contents: string[]) =>
      new Blob([
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          data: {
            songs: contents.map((content, i) => ({ name: `s${i}`, content })),
            songbooks: [],
          },
        }),
      ]);

    it('names a song the parser has something to say about', async () => {
      // Two title lines: only the last one shows, and the first is silently
      // lost — exactly the sort of thing that is discovered on the page.
      const { inbox } = setup();
      await inbox.offer([withContent('* First\n* Second\n\nWords')]);
      expect(inbox.item()?.flaggedSongs).toEqual(['s0']);
    });

    it('says nothing about a clean song', async () => {
      const { inbox } = setup();
      await inbox.offer([withContent('* Title\n\nVerse: Some [Am]words')]);
      expect(inbox.item()?.flaggedSongs).toEqual([]);
    });

    it('names each song once, however many warnings it carries', async () => {
      // Named, not counted: a number says how bad it is, a name says where the
      // reader has to go and look.
      const { inbox } = setup();
      await inbox.offer([
        withContent(
          '* One\n* Two\n** A\n** B\n\nWords',
          '* Clean\n\nWords',
          '* Three\n* Four\n\nWords',
        ),
      ]);
      expect(inbox.item()?.flaggedSongs).toEqual(['s0', 's2']);
    });
  });

  it('counts a write, so a screen holding its own number can hear about it', async () => {
    const { inbox } = setup();
    const before = inbox.writes();
    await inbox.offer([file('one')]);
    await inbox.confirm({ resolution: 'replace' });
    expect(inbox.writes()).toBe(before + 1);
  });
});
