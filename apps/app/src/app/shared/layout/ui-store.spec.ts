// UiStore — Epic 13
// Spec: PRD-UI-SHELL.md §7

import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiStore } from './ui-store';

describe('UiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts at an even split', () => {
    expect(TestBed.inject(UiStore).splitRatio('songs')).toBe(0.5);
  });

  it('survives a reload — the whole reason this is localStorage and not IndexedDB', () => {
    TestBed.inject(UiStore).setSplitRatio('songs', 0.62);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).splitRatio('songs')).toBeCloseTo(0.62);
  });

  it('clamps a ratio that would collapse a pane entirely', () => {
    const store = TestBed.inject(UiStore);

    store.setSplitRatio('songs', -3);
    expect(store.splitRatio('songs')).toBeGreaterThan(0);

    store.setSplitRatio('songs', 99);
    expect(store.splitRatio('songs')).toBeLessThan(1);
  });

  // Linked by default: a splitter is a habit, and one habit beats four.
  it('shares one size across modules while linked', () => {
    const store = TestBed.inject(UiStore);
    expect(store.isSplitShared()).toBe(true);

    store.setSplitRatio('songs', 0.7);
    expect(store.splitRatio('songbooks')).toBeCloseTo(0.7);
  });

  it('gives each module its own size once unlinked', () => {
    const store = TestBed.inject(UiStore);
    store.setSplitShared(false);

    store.setSplitRatio('songs', 0.7);
    store.setSplitRatio('songbooks', 0.3);

    expect(store.splitRatio('songs')).toBeCloseTo(0.7);
    expect(store.splitRatio('songbooks')).toBeCloseTo(0.3);
  });

  // The pane you are sizing must not jump out from under you when you link.
  it('adopts the current module’s size when linking', () => {
    const store = TestBed.inject(UiStore);
    store.setSplitRatio('songs', 0.8); // the shared value
    store.setSplitShared(false);
    store.setSplitRatio('songbooks', 0.25);

    store.setSplitShared(true, 'songbooks');

    expect(store.splitRatio('songs')).toBeCloseTo(0.25);
  });

  it('keeps each module’s size while linked, to hand back on unlink', () => {
    const store = TestBed.inject(UiStore);
    store.setSplitShared(false);
    store.setSplitRatio('songbooks', 0.25);

    store.setSplitShared(true, 'songbooks');
    store.setSplitRatio('songs', 0.6);
    store.setSplitShared(false);

    expect(store.splitRatio('songbooks')).toBeCloseTo(0.25);
  });

  it('remembers the link preference across a reload', () => {
    TestBed.inject(UiStore).setSplitShared(false);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).isSplitShared()).toBe(false);
  });

  it('falls back to defaults rather than failing a boot on unreadable storage', () => {
    // Private mode, quota, or a hand-edited value. Chrome prefs are not worth
    // taking the app down for.
    localStorage.setItem('achordeon.ui', '{ not json');

    expect(() => TestBed.inject(UiStore)).not.toThrow();
    expect(TestBed.inject(UiStore).splitRatio('songs')).toBe(0.5);
  });

  it('ignores a stored ratio of the wrong type', () => {
    localStorage.setItem(
      'achordeon.ui',
      JSON.stringify({ splitRatio: 'wide', isRailCollapsed: 'yes' }),
    );

    const store = TestBed.inject(UiStore);

    expect(store.splitRatio('songs')).toBe(0.5);
    expect(store.isRailCollapsed()).toBe(false);
  });

  // The dark page — one stored boolean (does the theme speak for the paper?)
  // and a derived answer. Device-local like the split ratio, for a reason of its
  // own: the performer's stage is dark and a viewer's kitchen is not, so this
  // must never sync.
  describe('the dark page', () => {
    /** The store with a theme wired in, and the switch to flip it. */
    function connect(): {
      store: UiStore;
      isDarkTheme: WritableSignal<boolean>;
    } {
      const store = TestBed.inject(UiStore);
      const isDarkTheme = signal(false);
      store.connectTheme(isDarkTheme);
      return { store, isDarkTheme };
    }

    it('starts unlinked, on white paper — the render is a document', () => {
      const { store, isDarkTheme } = connect();

      isDarkTheme.set(true);

      expect(store.isSongDarkFollowingTheme()).toBe(false);
      expect(store.isSongDark()).toBe(false);
    });

    it('turns the page over with the theme once asked', () => {
      const { store, isDarkTheme } = connect();
      store.setSongDarkFollowsTheme(true);

      isDarkTheme.set(true);
      expect(store.isSongDark()).toBe(true);

      isDarkTheme.set(false);
      expect(store.isSongDark()).toBe(false);
    });

    // Ticking the box while the app is already dark must do something you can
    // see, rather than promising it for the next theme change.
    it('applies the moment it is switched on', () => {
      const { store, isDarkTheme } = connect();
      isDarkTheme.set(true);
      expect(store.isSongDark()).toBe(false);

      store.setSongDarkFollowsTheme(true);

      expect(store.isSongDark()).toBe(true);
    });

    // Wiring happens at boot, after the store is built and possibly after
    // something has already read `isSongDark`. A computed cached against the
    // stub accessor would never recover.
    it('picks up a theme wired in after the first read', () => {
      const store = TestBed.inject(UiStore);
      store.setSongDarkFollowsTheme(true);
      expect(store.isSongDark()).toBe(false); // no theme yet

      store.connectTheme(() => true);

      expect(store.isSongDark()).toBe(true);
    });

    it('remembers the link across a reload', () => {
      TestBed.inject(UiStore).setSongDarkFollowsTheme(true);
      TestBed.resetTestingModule();

      expect(TestBed.inject(UiStore).isSongDarkFollowingTheme()).toBe(true);
    });

    it('ignores a stored link flag of the wrong type', () => {
      localStorage.setItem(
        'achordeon.ui',
        JSON.stringify({ isSongDarkFollowingTheme: 'yes' }),
      );

      expect(TestBed.inject(UiStore).isSongDarkFollowingTheme()).toBe(false);
    });

    // The flag this replaced. Honouring it would hand someone a black library
    // because they once pressed the moon on stage.
    it('does not read the old standalone dark-page flag', () => {
      localStorage.setItem(
        'achordeon.ui',
        JSON.stringify({ isSongDark: true }),
      );
      const { store, isDarkTheme } = connect();

      isDarkTheme.set(true);

      expect(store.isSongDark()).toBe(false);
    });
  });

  // Turn the page — an ARMED request, not a state (ADR-0013). It says the reader
  // is willing to hold the device the other way round; whether any given page is
  // actually turned is `gainsRoomTurned`'s answer, asked again per render.
  describe('turning the page', () => {
    it('starts unarmed — nobody wakes up to a sideways song', () => {
      expect(TestBed.inject(UiStore).isPageTurnArmed()).toBe(false);
    });

    it('flips both ways from the bars', () => {
      const store = TestBed.inject(UiStore);

      store.togglePageTurn();
      expect(store.isPageTurnArmed()).toBe(true);

      store.togglePageTurn();
      expect(store.isPageTurnArmed()).toBe(false);
    });

    // Unlike the zoom, which resets on every song change: a phone is still
    // sideways after the page turns, and re-tapping through a landscape set
    // would make the feature unusable.
    it('remembers the arming across a reload', () => {
      TestBed.inject(UiStore).setPageTurnArmed(true);
      TestBed.resetTestingModule();

      expect(TestBed.inject(UiStore).isPageTurnArmed()).toBe(true);
    });

    it('ignores a stored flag of the wrong type', () => {
      localStorage.setItem(
        'achordeon.ui',
        JSON.stringify({ isPageTurnArmed: 'yes' }),
      );

      expect(TestBed.inject(UiStore).isPageTurnArmed()).toBe(false);
    });

    it('starts unarmed on a device that stored nothing about it', () => {
      // An older install. The field is additive, so its absence must read as off
      // rather than as undefined leaking into a template.
      localStorage.setItem(
        'achordeon.ui',
        JSON.stringify({ isSongDarkFollowingTheme: true }),
      );

      expect(TestBed.inject(UiStore).isPageTurnArmed()).toBe(false);
    });

    // The offer describes the song currently on screen, and the next one may be
    // a different shape. Persisting it would let a control appear over a page it
    // cannot do anything to.
    it('keeps the offer session-only', () => {
      TestBed.inject(UiStore).setPageTurnOffered(true);
      TestBed.resetTestingModule();

      expect(TestBed.inject(UiStore).isPageTurnOffered()).toBe(false);
    });

    it('keeps the offer and the arming independent', () => {
      const store = TestBed.inject(UiStore);

      store.setPageTurnArmed(true);
      expect(store.isPageTurnOffered()).toBe(false);

      store.setPageTurnOffered(true);
      store.setPageTurnArmed(false);
      expect(store.isPageTurnOffered()).toBe(true);
    });
  });

  it('keeps fullscreen session-only — a reload must not claim to restore it', () => {
    TestBed.inject(UiStore).setFullscreen(true);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).isFullscreen()).toBe(false);
  });
});
