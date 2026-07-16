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
