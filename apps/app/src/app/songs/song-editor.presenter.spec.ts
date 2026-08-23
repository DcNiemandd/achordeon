// SongEditorPresenter — the autosave's exits (Epic 5 ▸ subtask 4)
// Spec: PRD-INFRASTRUCTURE.md §5 ("local work is never lost"), ADR-0004
//
// There is no Save button, so every edit's survival rests on the debounce being
// flushed on the way out. `onDestroy` covers the in-app route; these cover the
// exit the framework cannot see — a full page load.

import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import {
  DownloadService,
  ExportService,
  ParserService,
  RenderService,
  SessionStore,
  SettingsStore,
  ShareLinkService,
  SongStore,
  SyncService,
  defaultGlobalSettings,
} from '@achordeon/shared/data-access';
import { ChordTheory, type Song } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { UiStore } from '../shared/layout';
import { SongEditorPresenter } from './song-editor.presenter';

const SONG: Song = {
  id: 's1',
  name: 'Alpha',
  content: 'a line',
  favorite: false,
  settings: {},
  cache: { title: '', subtitle: '' },
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
};

/**
 * A document whose listeners can be fired by hand.
 *
 * The real events are the point of these tests, and jsdom will not dispatch a
 * `beforeunload` that means anything — so the seam is the `DOCUMENT` the
 * presenter injects, and firing is calling what it registered.
 */
class FakeDocument {
  visibilityState: DocumentVisibilityState = 'visible';
  readonly onDocument = new Map<string, EventListener>();
  readonly onWindow = new Map<string, EventListener>();

  readonly defaultView = {
    addEventListener: (type: string, handler: EventListener) => {
      this.onWindow.set(type, handler);
    },
    removeEventListener: (type: string) => {
      this.onWindow.delete(type);
    },
  };

  addEventListener(type: string, handler: EventListener): void {
    this.onDocument.set(type, handler);
  }

  removeEventListener(type: string): void {
    this.onDocument.delete(type);
  }

  /** Fire a window event, as the browser would on the way out of the page. */
  fire(type: string): void {
    this.onWindow.get(type)?.(new Event(type));
  }

  /** Fire a document event — `visibilitychange` reads the state, so set it. */
  fireOnDocument(type: string): void {
    this.onDocument.get(type)?.(new Event(type));
  }
}

describe('SongEditorPresenter — flushing on the way out of the page', () => {
  let doc: FakeDocument;
  let upsert: jest.Mock;
  let presenter: SongEditorPresenter;

  /** What the last write stored, or `undefined` if nothing was written. */
  const written = (): Song | undefined =>
    upsert.mock.calls.at(-1)?.[0] as Song | undefined;

  beforeEach(async () => {
    doc = new FakeDocument();
    upsert = jest.fn(async () => undefined);

    TestBed.configureTestingModule({
      providers: [
        SongEditorPresenter,
        { provide: ChordTheory, useClass: TonalChordTheory },
        { provide: DOCUMENT, useValue: doc },
        {
          provide: SongStore,
          useValue: {
            entities: () => [SONG],
            byId: async () => SONG,
            upsert,
            refresh: jest.fn(async () => undefined),
          },
        },
        { provide: SessionStore, useValue: { setCurrentSong: jest.fn() } },
        {
          provide: ParserService,
          useValue: {
            parse: (content: string) => ({ content, warnings: [] }),
            createReparser: () => ({ schedule: jest.fn(), cancel: jest.fn() }),
          },
        },
        {
          provide: RenderService,
          useValue: { layout: () => ({}), emit: () => '' },
        },
        {
          provide: SettingsStore,
          useValue: { global: () => defaultGlobalSettings() },
        },
        { provide: UiStore, useValue: { isSongDark: () => false } },
        { provide: SyncService, useValue: { pushSoon: jest.fn() } },
        { provide: DownloadService, useValue: {} },
        { provide: ExportService, useValue: {} },
        { provide: ShareLinkService, useValue: {} },
      ],
    });

    presenter = TestBed.inject(SongEditorPresenter);
    await presenter.load('s1');
    upsert.mockClear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('holds a just-made setting until the debounce, so a page load could outrun it', () => {
    presenter.patchSettings({ bodyFont: 'courierprime' });

    // The record on screen already has it; IndexedDB does not. This is the whole
    // window the bug lived in.
    expect(presenter.song()?.settings).toEqual({ bodyFont: 'courierprime' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flushes the pending setting on beforeunload', () => {
    presenter.patchSettings({ bodyFont: 'courierprime' });

    doc.fire('beforeunload');

    // Called synchronously, before the handler returns: a full page load leaves
    // no later moment (`pagehide` is already the teardown).
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(written()?.settings).toEqual({ bodyFont: 'courierprime' });
  });

  it('flushes pending keystrokes on beforeunload', () => {
    presenter.setContent('a line\nand another');

    doc.fire('beforeunload');

    expect(written()?.content).toBe('a line\nand another');
  });

  it('does not write twice when pagehide follows beforeunload', () => {
    presenter.patchSettings({ bodyFont: 'courierprime' });

    doc.fire('beforeunload');
    doc.fire('pagehide');

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('still flushes when the tab is hidden without unloading', () => {
    presenter.setContent('typed and swapped away');
    doc.visibilityState = 'hidden';

    doc.fireOnDocument('visibilitychange');

    expect(written()?.content).toBe('typed and swapped away');
  });

  it('stops listening to the page once the editor is destroyed', () => {
    presenter.patchSettings({ bodyFont: 'courierprime' });

    // Leaving the editor in-app: the destroy hook flushes, and the listeners go
    // with it — a later unload is not this editor's business.
    TestBed.resetTestingModule();
    expect(upsert).toHaveBeenCalledTimes(1);

    doc.fire('beforeunload');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
