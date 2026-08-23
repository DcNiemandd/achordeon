// AudiencePage — which bar a viewer gets, and at which width
//
// The module used to have one bar for both widths: the phone's three icon-only
// targets, mounted at the foot of the page on a desktop, with every other act
// folded behind ⋯. So a 1440px window watched a lobby through a phone's chrome
// while the performing view beside it laid its actions out across the row. This
// pins the two shapes apart — the page draws the wide one itself, and draws
// nothing at all on a phone, where the shell's one bottom bar carries
// AudienceBar instead.
//
// The controls themselves are AudienceBar's and the shell's business; what is
// asserted here is only which of the two arrangements the page is in.

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  LobbyViewer,
  ParserService,
  RenderService,
} from '@achordeon/shared/data-access';
import { ChordTheory } from '@achordeon/shared/domain';
import type {
  GlobalSettings,
  LobbyPayload,
  Song,
} from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { AudienceSession } from '../shared/layout';
import { setViewportWidth } from '../../test-setup';
import { AudiencePage } from './audience.page';

/** Above `--bp-compact` (1200px) and below it — the two sides of the switch. */
const DESKTOP_WIDTH = 1400;
const PHONE_WIDTH = 390;

function makePayload(): LobbyPayload {
  const song: Song = {
    id: 's1',
    name: 'Alpha',
    content: 'content',
    favorite: false,
    settings: {},
    cache: { title: 'First', subtitle: '' },
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
  return {
    song,
    settings: {} as GlobalSettings,
    summary: [{ index: 0, name: 'Alpha', title: 'First' }],
    currentIndex: 0,
  };
}

class FakeViewer {
  readonly payload = signal<LobbyPayload | null>(makePayload());
  readonly status = signal<string>('joined');
  readonly audienceCount = signal(1);
  readonly join = jest.fn(async () => undefined);
  readonly leave = jest.fn(async () => undefined);
  readonly requestSync = jest.fn(async () => undefined);
}

const fakeParser = { parse: (content: string) => ({ content }) };
// No SVG comes back on purpose: the sheet is not what is being asserted, and
// jsdom's `image/svg+xml` documents have no `style` for SongRender to size.
const fakeRenderer = {
  layout: () => ({ box: { width: 210, height: 297 } }),
  emit: () => '',
};

describe('AudiencePage — the bar a viewer gets', () => {
  let viewer: FakeViewer;

  /** jsdom has no ResizeObserver, and PageZoom measures the desk with one. */
  const realObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    viewer = new FakeViewer();
    localStorage.clear();
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: () => void) {}
      observe(): void {
        this.callback();
      }
      unobserve(): void {
        // Nothing to forget — the stub holds no registry.
      }
      disconnect(): void {
        // Same.
      }
    } as unknown as typeof ResizeObserver;

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ChordTheory, useClass: TonalChordTheory },
        { provide: LobbyViewer, useValue: viewer },
        { provide: ParserService, useValue: fakeParser },
        { provide: RenderService, useValue: fakeRenderer },
      ],
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = realObserver;
    setViewportWidth(DESKTOP_WIDTH);
  });

  /** A joined viewer on a lobby, at the width under test. */
  function watch(width: number): HTMLElement {
    setViewportWidth(width);
    const fixture = TestBed.createComponent(AudiencePage);
    fixture.componentRef.setInput('pin', 'STAGE');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const find = (root: HTMLElement, id: string) =>
    root.querySelector(`[data-testid="${id}"]`);

  it('lays the acts out across its own bar on a wide screen', () => {
    const root = watch(DESKTOP_WIDTH);
    const bar = find(root, 'audience-page-bar');

    expect(bar).not.toBeNull();
    // Unwrapped: the acts a phone hides behind ⋯ are buttons in the row, and
    // the stepper is the control itself rather than a menu item raising a sheet.
    expect(find(root, 'audience-menu')).toBeNull();
    for (const id of [
      'audience-summary',
      'audience-fullscreen',
      'audience-dark-page',
      'audience-hide-chords',
      'audience-lobby',
      'audience-sync',
      'audience-exit',
    ]) {
      expect(bar?.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    expect(bar?.querySelector('app-transpose-stepper')).not.toBeNull();
  });

  // The other half of the same rule: a phone must not get two bars, so the page
  // draws none and the shell mounts AudienceBar in its one bottom bar. The page
  // says the viewer is joined, which is what the shell reads to do it.
  it('draws no bar of its own on a phone, and tells the shell to', () => {
    const root = watch(PHONE_WIDTH);

    expect(find(root, 'audience-page-bar')).toBeNull();
    expect(TestBed.inject(AudienceSession).isMounted()).toBe(true);
  });

  // The PIN prompt is the module, not an act: there is no lobby to control yet.
  it('offers no controls before a lobby is joined', () => {
    viewer.status.set('not-found');

    expect(find(watch(DESKTOP_WIDTH), 'audience-page-bar')).toBeNull();
  });
});
