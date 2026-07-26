import { TestBed } from '@angular/core/testing';
import { LOCAL_USER_ID, type User } from '@achordeon/shared/domain';
import { MemoryEntitySource } from '../persistence/memory-entity-source';
import { USER_REPOSITORY } from './repositories';
import { defaultGlobalSettings, SettingsStore } from './settings-store';

describe('SettingsStore', () => {
  let users: MemoryEntitySource<User>;

  function userRow(over: Partial<User> = {}): User {
    return {
      id: LOCAL_USER_ID,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      username: '',
      planCache: 'free',
      settings: defaultGlobalSettings(),
      ...over,
    };
  }

  // Resets first, so a test can make a *second* store over the same rows — which
  // is the only way to spell "the user reloaded the app".
  function make(seed: User[] = []): SettingsStore {
    users = new MemoryEntitySource<User>(seed);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: USER_REPOSITORY, useValue: users }],
    });
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

  it('merges a sparse global override without dropping other keys', async () => {
    const store = make();
    await store.setGlobal({ columns: 2 });
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

  it('writes a global change through to the account row', async () => {
    const store = make();
    await store.setGlobal({ aspectRatio: '16:9' });

    const row = await users.get(LOCAL_USER_ID);
    expect(row?.settings.aspectRatio).toBe('16:9');
    expect(row?.deletedAt).toBeNull();
  });

  it('loads the saved bag back — the reload the user sees', async () => {
    await make().setGlobal({ aspectRatio: '16:9', columns: 2 });

    const next = make(await users.all());
    await next.load();
    expect(next.global().aspectRatio).toBe('16:9');
    expect(next.global().columns).toBe(2);
  });

  it('keeps the registry default for a key saved before it existed', async () => {
    const partial = { aspectRatio: '16:9' } as unknown as User['settings'];
    const store = make([userRow({ settings: partial })]);
    await store.load();

    expect(store.global().aspectRatio).toBe('16:9');
    expect(store.global().padding).toBe(defaultGlobalSettings().padding);
  });

  it('carries an unknown key from a newer build through the round-trip', async () => {
    const fromNewer = {
      ...defaultGlobalSettings(),
      glow: true,
    } as unknown as User['settings'];
    const store = make([userRow({ settings: fromNewer })]);
    await store.load();
    await store.setGlobal({ columns: 3 });

    const row = await users.get(LOCAL_USER_ID);
    expect((row?.settings as Record<string, unknown>)['glow']).toBe(true);
    expect(row?.settings.columns).toBe(3);
  });

  it('does not load a soft-deleted account row', async () => {
    const store = make([
      userRow({
        deletedAt: 5,
        settings: { ...defaultGlobalSettings(), columns: 4 },
      }),
    ]);
    await store.load();
    expect(store.global().columns).toBe(defaultGlobalSettings().columns);
  });

  it('keeps every change when writes overlap', async () => {
    const store = make();
    // Two edits in the same tick — a slider drag. Neither may read the other's
    // pre-write row and put back a bag missing its change.
    const first = store.setGlobal({ columns: 2 });
    const second = store.setGlobal({ aspectRatio: '4:3' });
    await Promise.all([first, second]);

    const row = await users.get(LOCAL_USER_ID);
    expect(row?.settings.columns).toBe(2);
    expect(row?.settings.aspectRatio).toBe('4:3');
  });

  it('survives a storage failure', async () => {
    const store = make();
    users.put = () => Promise.reject(new Error('quota'));

    await expect(store.setGlobal({ columns: 2 })).resolves.toBeUndefined();
    expect(store.global().columns).toBe(2);
  });

  it('tells its listeners once the row is written', async () => {
    const store = make();
    const seen: (number | undefined)[] = [];
    // Reading the row is the whole point of being told, so record what a listener
    // actually finds there — not merely that it was called.
    store.onSaved(() => {
      void users
        .get(LOCAL_USER_ID)
        .then((row) => seen.push(row?.settings.columns));
    });

    await store.setGlobal({ columns: 2 });
    await store.setGlobal({ columns: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual([2, 3]);
  });

  it('does not tell them about a write that failed', async () => {
    const store = make();
    let told = 0;
    store.onSaved(() => told++);
    users.put = () => Promise.reject(new Error('quota'));

    await store.setGlobal({ columns: 2 });

    expect(told).toBe(0);
  });
});
