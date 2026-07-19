import {
  resolveSettings,
  type GlobalSettings,
  type SongSettings,
  type SongbookSettings,
} from './settings';

const baseGlobal: GlobalSettings = {
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

describe('resolveSettings', () => {
  it('returns the global defaults when no overrides are given', () => {
    expect(resolveSettings(baseGlobal)).toEqual(baseGlobal);
  });

  it('lets a song override win over the global default', () => {
    const song: SongSettings = { columns: 2 };
    expect(resolveSettings(baseGlobal, undefined, song).columns).toBe(2);
  });

  it('applies a songbook override when the song does not set the key', () => {
    const songbook: SongbookSettings = { chordColor: '#abc' };
    expect(resolveSettings(baseGlobal, songbook).chordColor).toBe('#abc');
  });

  it('prefers the song over the songbook for the same key (most specific wins)', () => {
    const songbook: SongbookSettings = { chordColor: '#abc' };
    const song: SongSettings = { chordColor: '#def' };
    expect(resolveSettings(baseGlobal, songbook, song).chordColor).toBe('#def');
  });

  it('resolves each key independently (sparse merge)', () => {
    const songbook: SongbookSettings = { chordColor: '#abc' };
    const song: SongSettings = { columns: 3 };
    expect(resolveSettings(baseGlobal, songbook, song)).toEqual({
      ...baseGlobal,
      chordColor: '#abc',
      columns: 3,
    });
  });

  it('treats an explicit undefined override as "inherit"', () => {
    const song = { columns: undefined } as SongSettings;
    expect(resolveSettings(baseGlobal, undefined, song).columns).toBe(1);
  });

  it('does not mutate the inputs', () => {
    const global = { ...baseGlobal };
    const song: SongSettings = { columns: 2 };
    resolveSettings(global, undefined, song);
    expect(global).toEqual(baseGlobal);
  });

  it('returns a fresh object (never persists the effective value onto global)', () => {
    expect(resolveSettings(baseGlobal)).not.toBe(baseGlobal);
  });
});
