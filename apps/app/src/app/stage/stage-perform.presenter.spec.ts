// StagePerformPresenter — Epic 8 (performing) + Epic 9 (lobby host wiring)

import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  defaultGlobalSettings,
  LobbyHost,
  ParserService,
  RenderService,
  SettingsStore,
  SongStore,
  SongbookStore,
  SONG_REPOSITORY,
} from '@achordeon/shared/data-access';
import type { Song, Songbook } from '@achordeon/shared/domain';
import { StageSession } from '../shared/layout';
import { StagePerformPresenter } from './stage-perform.presenter';

function makeSong(id: string, name: string, title = ''): Song {
  return {
    id,
    name,
    content: `content-${id}`,
    favorite: false,
    settings: {},
    cache: { title, subtitle: '' },
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
}

const S1 = makeSong('s1', 'Alpha', 'First');
const S2 = makeSong('s2', 'Bravo', 'Second');
const SONGS: Record<string, Song> = { s1: S1, s2: S2 };

const BOOK: Songbook = {
  id: 'book1',
  name: 'My book',
  title: '',
  subtitle: '',
  author: '',
  entries: ['s1', 's2'],
  settings: {},
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
};

// A store-free StageSession stand-in: real signals so the presenter's effects
// react, jest.fn commands so the wiring can be asserted.
class FakeSession {
  readonly index = signal(0);
  readonly lobbyPin = signal('');
  readonly total = signal(0);
  readonly start = jest.fn(() => this.index.set(0));
  readonly setTotal = jest.fn((n: number) => this.total.set(n));
  readonly setAudienceCount = jest.fn();
}

class FakeHost {
  readonly audienceCount = signal(0);
  readonly sync = jest.fn(async () => undefined);
  readonly close = jest.fn(async () => undefined);
}

const fakeParser = { parse: (content: string) => ({ content }) };
const fakeRenderer = {
  layout: () => ({ box: { width: 210, height: 297 } }),
  emit: () => 'SVG:chords',
};

describe('StagePerformPresenter', () => {
  let session: FakeSession;
  let host: FakeHost;
  let router: { navigate: jest.Mock };
  let presenter: StagePerformPresenter;

  const flush = () => TestBed.inject(ApplicationRef).tick();
  const lastSync = () => {
    const calls = host.sync.mock.calls;
    return calls[calls.length - 1] as [
      string,
      ReturnType<typeof presenter.payload>,
    ];
  };

  beforeEach(() => {
    session = new FakeSession();
    host = new FakeHost();
    router = { navigate: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        StagePerformPresenter,
        { provide: StageSession, useValue: session },
        { provide: LobbyHost, useValue: host },
        { provide: Router, useValue: router },
        { provide: ParserService, useValue: fakeParser },
        { provide: RenderService, useValue: fakeRenderer },
        {
          provide: SettingsStore,
          useValue: { global: () => defaultGlobalSettings() },
        },
        { provide: SongStore, useValue: { allLive: async () => [] } },
        {
          provide: SongbookStore,
          useValue: {
            byId: async (id: string) => (id === 'book1' ? BOOK : null),
          },
        },
        {
          provide: SONG_REPOSITORY,
          useValue: { get: async (id: string) => SONGS[id] ?? null },
        },
      ],
    });
    presenter = TestBed.inject(StagePerformPresenter);
  });

  it('loads a songbook and renders its first song', async () => {
    await presenter.open('book1');

    expect(session.start).toHaveBeenCalledWith('book1');
    expect(session.setTotal).toHaveBeenCalledWith(2);
    expect(presenter.name()).toBe('My book');
    expect(presenter.isEmpty()).toBe(false);
    expect(presenter.svg()).toBe('SVG:chords');
    expect(presenter.pageRatio()).toBeCloseTo(210 / 297);
  });

  it('bounces a missing book back to the picker', async () => {
    await presenter.open('nope');
    expect(router.navigate).toHaveBeenCalledWith(['/stage']);
    expect(presenter.isEmpty()).toBe(true);
  });

  it('builds a payload carrying the full setlist and current position', async () => {
    await presenter.open('book1');

    const payload = presenter.payload();
    expect(payload?.song.id).toBe('s1');
    expect(payload?.currentIndex).toBe(0);
    expect(payload?.summary.map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    expect(payload?.settings).toBeTruthy();
  });

  it('opens the lobby channel when a PIN appears', async () => {
    await presenter.open('book1');
    session.lobbyPin.set('ABCDE');
    flush();

    expect(host.sync).toHaveBeenCalled();
    const [pin, payload] = lastSync();
    expect(pin).toBe('ABCDE');
    expect(payload?.song.id).toBe('s1');
    expect(payload?.currentIndex).toBe(0);
  });

  // Requirement: the setlist + position the host publishes track prev/next.
  it('re-syncs the payload on every song change while hosting', async () => {
    await presenter.open('book1');
    session.lobbyPin.set('ABCDE');
    flush();

    session.index.set(1); // host presses "next"
    flush();

    const [, payload] = lastSync();
    expect(payload?.song.id).toBe('s2');
    expect(payload?.currentIndex).toBe(1);
    expect(payload?.summary.map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('closes the channel when the PIN clears', async () => {
    await presenter.open('book1');
    session.lobbyPin.set('ABCDE');
    flush();
    host.sync.mockClear();

    session.lobbyPin.set('');
    flush();
    expect(host.close).toHaveBeenCalled();
  });

  it('mirrors the live audience count back to the session', () => {
    host.audienceCount.set(5);
    flush();
    expect(session.setAudienceCount).toHaveBeenCalledWith(5);
  });
});
