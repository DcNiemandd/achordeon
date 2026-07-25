// Localization — Epic 11 ▸ i18n
// Spec: PRD-INFRASTRUCTURE.md §11

import { DOCUMENT, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Localization } from './localization';

/** The deploy shapes that matter: the source locale at the base, and a sub-path. */
function setup(locale: string, baseURI: string, url = '/songs/42/edit') {
  const assign = jest.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: locale },
      { provide: Router, useValue: { url } },
      {
        provide: DOCUMENT,
        useValue: { baseURI, defaultView: { location: { assign } } },
      },
    ],
  });
  return { service: TestBed.inject(Localization), assign };
}

describe('Localization', () => {
  beforeEach(() => localStorage.clear());

  it('reports the language the running bundle was built for', () => {
    expect(setup('cs', 'https://x.io/achordeon/app/cs/').service.current).toBe(
      'cs',
    );
    expect(setup('en', 'https://x.io/achordeon/app/').service.current).toBe(
      'en',
    );
  });

  it('resolves a region-tagged or unknown locale to a language we have', () => {
    expect(setup('cs-CZ', 'https://x.io/a/cs/').service.current).toBe('cs');
    expect(setup('de', 'https://x.io/a/').service.current).toBe('en');
  });

  it('adds the sub-path when leaving the source locale, and keeps the route', () => {
    const { service, assign } = setup('en', 'https://x.io/achordeon/app/');
    service.switchTo('cs');

    // Same song, same screen — only the build changes.
    expect(assign).toHaveBeenCalledWith('/achordeon/app/cs/songs/42/edit');
  });

  it('strips the sub-path when returning to the source locale', () => {
    const { service, assign } = setup('cs', 'https://x.io/achordeon/app/cs/');
    service.switchTo('en');

    expect(assign).toHaveBeenCalledWith('/achordeon/app/songs/42/edit');
  });

  it('works at the domain root, where there is no deploy path to keep', () => {
    const { service, assign } = setup('en', 'https://x.io/', '/settings');
    service.switchTo('cs');

    expect(assign).toHaveBeenCalledWith('/cs/settings');
  });

  it('persists the choice for the pre-boot redirect', () => {
    const { service } = setup('en', 'https://x.io/achordeon/app/');
    service.switchTo('cs');

    // index.html.template reads this on every load, so a bookmark to the English
    // URL still opens in Czech.
    expect(localStorage.getItem('achordeon.language')).toBe('cs');
  });

  it('spends no reload on the language already running, but still records it', () => {
    const { service, assign } = setup('cs', 'https://x.io/achordeon/app/cs/');
    service.switchTo('cs');

    expect(assign).not.toHaveBeenCalled();
    // The preference may have been implicit (auto-detected) until now.
    expect(localStorage.getItem('achordeon.language')).toBe('cs');
  });

  it('switches even when the choice cannot be stored', () => {
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    const { service, assign } = setup('en', 'https://x.io/achordeon/app/');

    expect(() => service.switchTo('cs')).not.toThrow();
    expect(assign).toHaveBeenCalled();

    setItem.mockRestore();
  });
});
