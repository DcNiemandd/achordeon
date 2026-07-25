// Localization — Epic 11 ▸ i18n
// Spec: PRD-INFRASTRUCTURE.md §11 (runtime `@angular/localize`, one bundle)

import { DOCUMENT, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Localization, chosenLanguage } from './localization';

function setup(locale: string) {
  const reload = jest.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: locale },
      {
        provide: DOCUMENT,
        useValue: { defaultView: { location: { reload } } },
      },
    ],
  });
  return { service: TestBed.inject(Localization), reload };
}

describe('chosenLanguage', () => {
  const language = jest.spyOn(navigator, 'language', 'get');

  beforeEach(() => {
    localStorage.clear();
    language.mockReturnValue('en-GB');
  });

  afterAll(() => language.mockRestore());

  it('takes the stored choice above everything else', () => {
    localStorage.setItem('achordeon.language', 'cs');
    language.mockReturnValue('en-GB');

    // An explicit choice is not a guess to be second-guessed on the next boot.
    expect(chosenLanguage()).toBe('cs');
  });

  it('falls back to the browser when nothing has been chosen', () => {
    language.mockReturnValue('cs-CZ');
    expect(chosenLanguage()).toBe('cs');
  });

  it('falls back to the source language for one we do not have', () => {
    language.mockReturnValue('de-DE');
    expect(chosenLanguage()).toBe('en');
  });

  it('ignores a stored value that is not a language we have', () => {
    localStorage.setItem('achordeon.language', 'klingon');
    language.mockReturnValue('cs');

    expect(chosenLanguage()).toBe('cs');
  });

  it('survives storage being unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    language.mockReturnValue('cs');

    expect(chosenLanguage()).toBe('cs');

    jest.restoreAllMocks();
    language.mockReturnValue('en-GB');
  });
});

describe('Localization', () => {
  beforeEach(() => localStorage.clear());

  it('reports the language the app actually booted with', () => {
    // From LOCALE_ID, which main.ts sets from the catalog it loaded — so this
    // cannot disagree with what is on screen, as a stored preference could.
    expect(setup('cs').service.current).toBe('cs');
    expect(setup('en').service.current).toBe('en');
  });

  it('resolves a region-tagged or unknown locale to a language we have', () => {
    expect(setup('cs-CZ').service.current).toBe('cs');
    expect(setup('en-US').service.current).toBe('en');
    expect(setup('de').service.current).toBe('en');
  });

  it('persists the choice, then reloads into it', () => {
    const { service, reload } = setup('en');
    service.switchTo('cs');

    // The write matters more than the reload: main.ts reads it on every boot.
    expect(localStorage.getItem('achordeon.language')).toBe('cs');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('spends no reload on the language already running, but still records it', () => {
    const { service, reload } = setup('cs');
    service.switchTo('cs');

    expect(reload).not.toHaveBeenCalled();
    // It may have been an auto-detected guess until now; a confirmed guess should
    // stop being a guess.
    expect(localStorage.getItem('achordeon.language')).toBe('cs');
  });

  it('switches even when the choice cannot be stored', () => {
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    const { service, reload } = setup('en');

    expect(() => service.switchTo('cs')).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
  });
});
