// UiStore — Epic 13
// Spec: PRD-UI-SHELL.md §7

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

  it('keeps fullscreen session-only — a reload must not claim to restore it', () => {
    TestBed.inject(UiStore).setFullscreen(true);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).isFullscreen()).toBe(false);
  });
});
