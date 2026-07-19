import { migrate } from './migration';
import { SCHEMA_VERSION, type SnapshotEnvelope } from './snapshot';
import type { GlobalSettings } from './settings';

const globalSettings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  titleFont: 'body',
  padding: 0.5,
  chordColor: '#000',
  chordSize: 1,
};

function baseSnapshot(
  overrides: Partial<SnapshotEnvelope> = {},
): SnapshotEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId: 'dev-1',
    updatedAt: 0,
    data: {
      user: [
        {
          id: 'u1',
          createdAt: 0,
          updatedAt: 0,
          deletedAt: null,
          username: 'me',
          planCache: 'free',
          settings: globalSettings,
        },
      ],
      songs: [
        {
          id: 's1',
          createdAt: 0,
          updatedAt: 0,
          deletedAt: null,
          name: 'Song',
          content: '',
          favorite: false,
          settings: {},
          cache: { title: '', subtitle: '' },
        },
      ],
      songbooks: [],
    },
    ...overrides,
  };
}

describe('migrate', () => {
  it('returns ok and stamps the current version for a clean current snapshot', () => {
    const { snapshot, status } = migrate(baseSnapshot());
    expect(status).toBe('ok');
    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('refuses a snapshot newer than this client understands', () => {
    const incoming = baseSnapshot({ schemaVersion: SCHEMA_VERSION + 1 });
    const { snapshot, status } = migrate(incoming);
    expect(status).toBe('refuse');
    expect(snapshot).toBe(incoming); // returned untouched — never guess a down-migration
  });

  it('warns when a settings bag carries an unknown (newer-app) key', () => {
    const input = baseSnapshot();
    input.data.songs[0].settings = { columns: 2, blink: true } as never;
    expect(migrate(input).status).toBe('warn');
  });

  it('preserves unknown keys — patch in place, never rebuild from known keys', () => {
    const input = baseSnapshot();
    // an additive field an older client wouldn't recognise, on the record and in a bag
    (input.data.songs[0] as unknown as Record<string, unknown>)['mood'] =
      'happy';
    input.data.user[0].settings = { ...globalSettings, glow: true } as never;

    const { snapshot } = migrate(input);

    const song = snapshot.data.songs[0] as unknown as Record<string, unknown>;
    const userSettings = snapshot.data.user[0].settings as Record<
      string,
      unknown
    >;
    expect(song['mood']).toBe('happy');
    expect(userSettings['glow']).toBe(true);
  });
});
