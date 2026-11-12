// SongSiteFlow — the Song site dialog and the Song preview dialog's one state
// (plans/import-chord-sheets.md phase 6, Q15–Q20, Q59–Q62).
//
// Driven with a fake SongSiteService, so nothing here reaches the function.

import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import type { Song } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import { SONG_REPOSITORY, songPagingConfig } from '../stores/repositories';
import { provideAchordeonData } from '../providers';
import { SongSiteFlow } from './song-site-flow';
import {
  SongSiteError,
  SongSiteService,
  type SongSiteGroup,
  type SongSiteSong,
} from './song-site-service';

/** As plnyzpevnik writes it: ChordPro, German chords, no {title}. */
const POHODA: SongSiteSong = {
  site: 1,
  title: 'Pohoda',
  artist: 'Sám Sebou',
  text: '{start_of_verse: P1}\n[Ami]Dnes ráno [H7]kávou\n{end_of_verse}',
  format: 'chordpro',
  url: 'https://plnyzpevnik.cz/zpevnik/sam-sebou/pohoda',
};

const SITES = [{ site: 1, name: 'Plný zpěvník', urlHint: 'plnyzpevnik.cz' }];

const GROUPS: SongSiteGroup[] = [
  {
    site: 1,
    results: [{ id: 'sam-sebou/pohoda', title: 'Pohoda', artist: 'Sám Sebou' }],
  },
];

function setup() {
  const songSites = {
    isAvailable: () => true,
    sites: jest.fn(async () => SITES),
    search: jest.fn(async (): Promise<SongSiteGroup[]> => GROUPS),
    song: jest.fn(async (): Promise<SongSiteSong> => {
      throw new Error('no song set up');
    }),
  };
  const source = new MemoryEntitySource<Song>([]);
  TestBed.configureTestingModule({
    providers: [
      ...provideAchordeonData(),
      { provide: SongSiteService, useValue: songSites },
      {
        provide: SONG_REPOSITORY,
        useValue: new PagedRepository(source, songPagingConfig),
      },
    ],
  });
  return { flow: TestBed.inject(SongSiteFlow), songSites, source };
}

describe('SongSiteFlow', () => {
  it('opens on the search, knowing which sites it can read', async () => {
    const { flow } = setup();
    await flow.open();
    expect(flow.isOpen()).toBe(true);
    expect(flow.view()).toBe('search');
    expect(flow.sites()).toEqual(SITES);
  });

  it('searches every site for what was typed, and shows each site’s group', async () => {
    const { flow, songSites } = setup();
    await flow.open();
    await flow.submit('  pohoda ');
    expect(songSites.search).toHaveBeenCalledWith('pohoda');
    expect(flow.query()).toBe('  pohoda ');
    expect(flow.groups()).toEqual(GROUPS);
  });

  it('opens a pasted link straight in the preview, converted into English', async () => {
    const { flow, songSites } = setup();
    songSites.song.mockResolvedValue(POHODA);
    await flow.open();
    await flow.submit('https://plnyzpevnik.cz/zpevnik/sam-sebou/pohoda ');
    expect(songSites.search).not.toHaveBeenCalled();
    expect(songSites.song).toHaveBeenCalledWith({
      url: 'https://plnyzpevnik.cz/zpevnik/sam-sebou/pohoda',
    });
    expect(flow.view()).toBe('preview');
    expect(flow.preview()).toEqual({
      song: POHODA,
      version: 0,
      name: 'Pohoda – Sám Sebou',
      content: '* Pohoda\n** Sám Sebou\n\nP1: [Am]Dnes ráno [B7]kávou\n',
    });
  });

  it('opens a result in the preview, and Back finds the search as it was', async () => {
    const { flow, songSites } = setup();
    songSites.song.mockResolvedValue(POHODA);
    await flow.open();
    await flow.submit('pohoda');
    await flow.choose(1, 'sam-sebou/pohoda');
    expect(songSites.song).toHaveBeenCalledWith({
      site: 1,
      id: 'sam-sebou/pohoda',
    });
    expect(flow.view()).toBe('preview');

    flow.back();
    expect(flow.view()).toBe('search');
    expect(flow.query()).toBe('pohoda');
    expect(flow.groups()).toEqual(GROUPS);
    expect(songSites.search).toHaveBeenCalledTimes(1);
  });

  it('shows another version when one is chosen', async () => {
    const { flow, songSites } = setup();
    songSites.song.mockResolvedValue({
      ...POHODA,
      versions: [
        { label: 'Version 1', text: POHODA.text },
        { label: 'Version 2', text: '[Hmi]Jinak' },
      ],
    });
    await flow.open();
    await flow.choose(1, 'sam-sebou/pohoda');
    flow.chooseVersion(1);
    expect(flow.preview()?.version).toBe(1);
    expect(flow.preview()?.content).toBe(
      '* Pohoda\n** Sám Sebou\n\n[Bm]Jinak\n',
    );
  });

  it('keeps a failure for the dialog to word, and stays on the search', async () => {
    const { flow, songSites } = setup();
    songSites.song.mockRejectedValue(new SongSiteError('unsupported-url'));
    await flow.open();
    await flow.submit('https://example.com/song');
    expect(flow.failure()).toBe('unsupported-url');
    expect(flow.view()).toBe('search');
    expect(flow.isBusy()).toBe(false);
  });

  it('imports the preview as one new song, and closes', async () => {
    const { flow, songSites, source } = setup();
    songSites.song.mockResolvedValue(POHODA);
    await flow.open();
    await flow.choose(1, 'sam-sebou/pohoda');
    const id = await flow.importSong();

    const songs = await source.all();
    expect(songs.map((s) => [s.id, s.name, s.content, s.settings])).toEqual([
      [
        id,
        'Pohoda – Sám Sebou',
        '* Pohoda\n** Sám Sebou\n\nP1: [Am]Dnes ráno [B7]kávou\n',
        {},
      ],
    ]);
    expect(songs[0].cache).toEqual({ title: 'Pohoda', subtitle: 'Sám Sebou' });
    expect(flow.isOpen()).toBe(false);
  });

  it('asks nothing for fewer than two characters', async () => {
    const { flow, songSites } = setup();
    await flow.open();
    await flow.submit(' p ');
    expect(songSites.search).not.toHaveBeenCalled();
    expect(songSites.song).not.toHaveBeenCalled();
  });
});
