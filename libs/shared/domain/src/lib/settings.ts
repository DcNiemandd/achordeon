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
  titleFont: {
    default: 'body' as 'body' | 'serif' | 'display' | 'script',
    scopes: ['songbook', 'song'],
  }, // the face for Title AND Subtitle together — one title block, one decision.
  // 'body' = whatever the rest of the song is set in. Songbook scope so a book can
  // impose one house style. See PRD-RENDERING §4.10
  //
  // Epic 7 swapped 'sans' for 'display' + 'script': every choice now carries
  // bundled bytes, and a plain sans was the one that looked least unlike the
  // body mono at title size while costing just as much to bundle. Not a schema
  // break (ADR-0007) — nothing about the record's *shape* moved, and a song
  // still holding 'sans' resolves to 'body', which is this setting's own default.
  aspectRatio: {
    default: 'A4' as
      | 'A4'
      | number
      | `${number}:${number}`
      | `${number}/${number}`,
    scopes: ['song'],
  },
  padding: {
    default: 0.5 as number,
    scopes: ['song'],
  }, // white border inside the render box, in em (× the base font size). Inset —
  // the aspect ratio stays user-owned. The songbook's print margin ADDS to this
  // rather than overriding it, so it is NOT a songbook scope. See PRD-RENDERING §4.11
  contentX: {
    default: 'center' as 'left' | 'center' | 'right',
    scopes: ['song'],
  }, // horizontal anchor of the content in the render box. Default centre — a song
  // that does not fill the page reads better centred than clinging to a corner.
  // See PRD-RENDERING §4.1.
  contentY: {
    default: 'middle' as 'top' | 'middle' | 'bottom',
    scopes: ['song'],
  }, // vertical anchor; orthogonal to contentX. A songbook title page overrides
  // both to centre via RenderOpts.align (not a setting). See PRD-RENDERING §4.1.
  chordColor: {
    default: '#9f1212' as `#${string}`,
    scopes: ['songbook', 'song'],
  },
  chordSize: {
    default: 1 as number,
    scopes: ['songbook', 'song'],
  }, // songbook scope alongside chordColor: CONTEXT.md §Songbook says a book
  // "can restyle the chords of all its songs — chord color, chord size and font".
  // A book that could re-colour chords but not resize them was half a theme.
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

export function resolveSettings(
  global: GlobalSettings,
  songbook?: SongbookSettings,
  song?: SongSettings,
): GlobalSettings {
  const resolved = { ...global };
  for (const key of Object.keys(resolved) as (keyof GlobalSettings)[]) {
    // song/songbook are sparse subsets of GlobalSettings' keys; per key the
    // value types line up, but TS can't track that correlation across a union
    // of keys, so the write is asserted through one indexable type.
    const override =
      song?.[key as keyof SongSettings] ??
      songbook?.[key as keyof SongbookSettings];
    if (override !== undefined) {
      (resolved as Record<keyof GlobalSettings, unknown>)[key] = override;
    }
  }
  return resolved;
}
