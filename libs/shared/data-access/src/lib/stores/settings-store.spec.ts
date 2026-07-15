import { TestBed } from '@angular/core/testing';
import { defaultGlobalSettings, SettingsStore } from './settings-store';

describe('SettingsStore', () => {
  function make(): SettingsStore {
    TestBed.configureTestingModule({});
    return TestBed.inject(SettingsStore);
  }

  it('starts from the registry defaults with system theme and EN', () => {
    const store = make();
    expect(store.global()).toEqual(defaultGlobalSettings());
    expect(store.theme()).toBe('system');
    expect(store.language()).toBe('en');
  });

  it('hydrates only the provided fields', () => {
    const store = make();
    store.hydrate({ theme: 'dark' });
    expect(store.theme()).toBe('dark');
    expect(store.language()).toBe('en'); // untouched
    expect(store.global()).toEqual(defaultGlobalSettings()); // untouched
  });

  it('merges a sparse global override without dropping other keys', () => {
    const store = make();
    store.setGlobal({ columns: 2 });
    expect(store.global().columns).toBe(2);
    expect(store.global().scale).toBe(defaultGlobalSettings().scale);
  });

  it('sets theme and language', () => {
    const store = make();
    store.setTheme('light');
    store.setLanguage('cs');
    expect(store.theme()).toBe('light');
    expect(store.language()).toBe('cs');
  });
});
