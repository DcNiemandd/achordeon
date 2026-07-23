// AudiencePresenter — Epic 9 (viewer render-derived state)

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LobbyViewer,
  ParserService,
  RenderService,
} from '@achordeon/shared/data-access';
import type {
  GlobalSettings,
  LobbyPayload,
  Song,
} from '@achordeon/shared/domain';
import { AudiencePresenter } from './audience.presenter';

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

/** A payload whose current song is `songs[index]`. */
function makePayload(
  index: number,
  songs: readonly { id: string; name: string; title: string }[],
): LobbyPayload {
  const cur = songs[index];
  return {
    song: makeSong(cur.id, cur.name, cur.title),
    settings: {} as GlobalSettings,
    summary: songs.map((s, i) => ({ index: i, name: s.name, title: s.title })),
    currentIndex: index,
  };
}

// A viewer stub whose signals the test drives directly.
class FakeViewer {
  readonly payload = signal<LobbyPayload | null>(null);
  readonly status = signal<string>('idle');
  readonly audienceCount = signal(0);
  readonly join = jest.fn(async () => undefined);
  readonly leave = jest.fn(async () => undefined);
}

// The renderer's decisions are not under test here — only that the presenter
// wires content + settings + hideChords through and reads the box back.
const fakeParser = { parse: (content: string) => ({ content }) };
const fakeRenderer = {
  layout: (
    _ast: unknown,
    _settings: unknown,
    opts?: { hideChords?: boolean },
  ) => ({ box: { width: 210, height: 297 }, hide: !!opts?.hideChords }),
  emit: (plan: { hide: boolean }) =>
    plan.hide ? 'SVG:nochords' : 'SVG:chords',
};

describe('AudiencePresenter', () => {
  let viewer: FakeViewer;
  let presenter: AudiencePresenter;

  const SONGS = [
    { id: 's1', name: 'Alpha', title: 'First' },
    { id: 's2', name: 'Bravo', title: 'Second' },
    { id: 's3', name: 'Charlie', title: 'Third' },
  ];

  beforeEach(() => {
    viewer = new FakeViewer();
    TestBed.configureTestingModule({
      providers: [
        AudiencePresenter,
        { provide: LobbyViewer, useValue: viewer },
        { provide: ParserService, useValue: fakeParser },
        { provide: RenderService, useValue: fakeRenderer },
      ],
    });
    presenter = TestBed.inject(AudiencePresenter);
  });

  it('shows nothing until a payload arrives', () => {
    expect(presenter.svg()).toBe('');
    expect(presenter.summaryRows()).toEqual([]);
    expect(presenter.currentIndex()).toBe(-1);
    expect(presenter.songName()).toBe('');
  });

  it('renders the host payload locally', () => {
    viewer.payload.set(makePayload(0, SONGS));

    expect(presenter.songName()).toBe('Alpha');
    expect(presenter.svg()).toBe('SVG:chords');
    expect(presenter.pageRatio()).toBeCloseTo(210 / 297);
    expect(presenter.summaryRows()).toHaveLength(3);
    expect(presenter.currentIndex()).toBe(0);
  });

  // Requirement: the summary follows the songbook the host is performing.
  it('updates the summary and current mark as the host moves', () => {
    viewer.payload.set(makePayload(0, SONGS));
    expect(presenter.currentIndex()).toBe(0);
    expect(presenter.songName()).toBe('Alpha');

    // Host advances to the third song — same book, new position + song.
    viewer.payload.set(makePayload(2, SONGS));
    expect(presenter.currentIndex()).toBe(2);
    expect(presenter.songName()).toBe('Charlie');
    expect(presenter.summaryRows().map((r) => r.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('reflects a changed setlist, not just a moved index', () => {
    viewer.payload.set(makePayload(0, SONGS));
    const shorter = [
      { id: 'x', name: 'Only', title: '' },
      { id: 'y', name: 'Other', title: '' },
    ];
    viewer.payload.set(makePayload(1, shorter));

    expect(presenter.summaryRows().map((r) => r.name)).toEqual([
      'Only',
      'Other',
    ]);
    expect(presenter.currentIndex()).toBe(1);
  });

  it('filters the read-only summary by query', () => {
    viewer.payload.set(makePayload(0, SONGS));
    presenter.setSummaryQuery('char');
    expect(presenter.summaryRows().map((r) => r.name)).toEqual(['Charlie']);

    presenter.setSummaryQuery('second'); // matches on title
    expect(presenter.summaryRows().map((r) => r.name)).toEqual(['Bravo']);
  });

  it('hide-chords is viewer-local and re-renders', () => {
    viewer.payload.set(makePayload(0, SONGS));
    expect(presenter.hideChords()).toBe(false);
    expect(presenter.svg()).toBe('SVG:chords');

    presenter.toggleHideChords();
    expect(presenter.hideChords()).toBe(true);
    expect(presenter.svg()).toBe('SVG:nochords');
  });

  it('exposes the live audience count', () => {
    viewer.audienceCount.set(4);
    expect(presenter.audienceCount()).toBe(4);
  });

  it('delegates join/leave to the transport', async () => {
    await presenter.join('ABCDE');
    expect(viewer.join).toHaveBeenCalledWith('ABCDE');
    await presenter.leave();
    expect(viewer.leave).toHaveBeenCalled();
  });
});
