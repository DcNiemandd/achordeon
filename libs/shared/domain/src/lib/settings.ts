export const SCOPES = ['global', 'songbook', 'song'] as const; // ordered least → most specific
type Scope = (typeof SCOPES)[number];

type SettingDef = {
  default: unknown;
  scopes: Scope[];
};

// One row per setting. Adding a setting = add a row; moving scopes = edit `scopes`.
export const SETTINGS = {
  scale: {
    default: 'auto' as number | 'auto',
    scopes: ['song'],
  }, // uniform content-box→render-box fit; 'auto' = max fit, number = manual (may overflow). See PRD-RENDERING §4.1
  columns: {
    default: 1 as number,
    scopes: ['song'],
  },
  titlePosition: {
    default: 'top' as 'top' | 'left',
    scopes: ['song'],
  }, // 'top' | 'left' (CCW spine). See PRD-RENDERING §4.5
  titleLayout: {
    default: 'stacked' as 'stacked' | 'inline',
    scopes: ['song'],
  }, // 'stacked' | 'inline' subtitle vs title; orthogonal to titlePosition. See PRD-RENDERING §4.5
  aspectRatio: {
    default: 'A4' as
      | 'A4'
      | number
      | `${number}:${number}`
      | `${number}/${number}`,
    scopes: ['song'],
  },
  chordColor: {
    default: '#9f1212' as `#${string}`,
    scopes: ['songbook', 'song'],
  },
  chordSize: {
    default: 1 as number,
    scopes: ['song'],
  },
  // font: {
  //   default: 'serif' as string,
  //   scopes: ['songbook', 'song'],
  // },
} satisfies Record<string, SettingDef>;

type ValueOf<K extends keyof typeof SETTINGS> = (typeof SETTINGS)[K]['default'];
type SettingsFor<S extends Scope> = {
  [K in keyof typeof SETTINGS as S extends (typeof SETTINGS)[K]['scopes'][number]
    ? K
    : never]?: ValueOf<K>;
};

export type GlobalSettings = { [K in keyof typeof SETTINGS]: ValueOf<K> }; // complete
export type SongSettings = SettingsFor<'song'>;
export type SongbookSettings = SettingsFor<'songbook'>;
