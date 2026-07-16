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
    expect(TestBed.inject(UiStore).splitRatio()).toBe(0.5);
  });

  it('survives a reload — the whole reason this is localStorage and not IndexedDB', () => {
    TestBed.inject(UiStore).setSplitRatio(0.62);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).splitRatio()).toBeCloseTo(0.62);
  });

  it('clamps a ratio that would collapse a pane entirely', () => {
    const store = TestBed.inject(UiStore);

    store.setSplitRatio(-3);
    expect(store.splitRatio()).toBeGreaterThan(0);

    store.setSplitRatio(99);
    expect(store.splitRatio()).toBeLessThan(1);
  });

  it('falls back to defaults rather than failing a boot on unreadable storage', () => {
    // Private mode, quota, or a hand-edited value. Chrome prefs are not worth
    // taking the app down for.
    localStorage.setItem('achordeon.ui', '{ not json');

    expect(() => TestBed.inject(UiStore)).not.toThrow();
    expect(TestBed.inject(UiStore).splitRatio()).toBe(0.5);
  });

  it('ignores a stored ratio of the wrong type', () => {
    localStorage.setItem(
      'achordeon.ui',
      JSON.stringify({ splitRatio: 'wide', isRailCollapsed: 'yes' }),
    );

    const store = TestBed.inject(UiStore);

    expect(store.splitRatio()).toBe(0.5);
    expect(store.isRailCollapsed()).toBe(false);
  });

  it('keeps fullscreen session-only — a reload must not claim to restore it', () => {
    TestBed.inject(UiStore).setFullscreen(true);
    TestBed.resetTestingModule();

    expect(TestBed.inject(UiStore).isFullscreen()).toBe(false);
  });
});
