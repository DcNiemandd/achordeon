// ThemeApplier — Epic 13
// Spec: PRD-UI-SHELL.md §6

import { TestBed } from '@angular/core/testing';
import { ThemeApplier } from './theme-applier';

describe('ThemeApplier', () => {
  let applier: ThemeApplier;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
    applier = TestBed.inject(ThemeApplier);
  });

  it('stamps an explicit choice onto the document element', () => {
    applier.apply('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applier.apply('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("leaves NO attribute for 'system' — the sheet must be free to follow the OS", () => {
    applier.apply('dark');
    applier.apply('system');

    // Setting data-theme="system" would match neither [data-theme='dark'] nor
    // [data-theme='light'], but would still beat the bare :root default. The
    // attribute has to be gone, not merely different.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('caches the choice for the pre-paint script', () => {
    // index.html.template reads this key before Angular boots; without it a
    // dark-mode user sees a white flash.
    applier.apply('dark');

    expect(localStorage.getItem('achordeon.theme')).toBe('dark');
  });

  // The resolved answer, for the dark page that follows it (UiStore.followTheme).
  // A CHOICE of 'system' is not an answer until the OS is asked.
  describe('the resolved theme', () => {
    const original = window.matchMedia;

    afterEach(() => {
      window.matchMedia = original;
    });

    /** Stand in for the OS switch, and hand back a way to flip it under us. */
    function mockPrefersDark(matches: boolean): (next: boolean) => void {
      const listeners: ((event: { matches: boolean }) => void)[] = [];
      window.matchMedia = (() => ({
        matches,
        addEventListener: (_: string, listener: (e: never) => void) =>
          listeners.push(listener as (event: { matches: boolean }) => void),
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      return (next) => listeners.forEach((l) => l({ matches: next }));
    }

    /** A fresh applier, built after the OS mock is in place. */
    function build(): ThemeApplier {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      return TestBed.inject(ThemeApplier);
    }

    it('takes an explicit choice at its word', () => {
      applier.apply('dark');
      expect(applier.isDark()).toBe(true);

      applier.apply('light');
      expect(applier.isDark()).toBe(false);
    });

    it("asks the OS for 'system' — and keeps listening", () => {
      const flip = mockPrefersDark(true);
      const fresh = build();

      fresh.apply('system');
      expect(fresh.isDark()).toBe(true);

      // Dusk, with the app already open. A one-off read would miss this.
      flip(false);
      expect(fresh.isDark()).toBe(false);
    });

    it('lets a choice outrank the OS', () => {
      mockPrefersDark(true);
      const fresh = build();

      fresh.apply('light');

      expect(fresh.isDark()).toBe(false);
    });
  });

  it('still themes when storage is unavailable', () => {
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });

    expect(() => applier.apply('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setItem.mockRestore();
  });
});
