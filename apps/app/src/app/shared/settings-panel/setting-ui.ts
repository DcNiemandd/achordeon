// Settings UI copy + control mapping — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes), §5.2 (where help text lives)

import { SETTINGS, SCOPES } from '@achordeon/shared/domain';

export type Scope = (typeof SCOPES)[number];
export type SettingKey = keyof typeof SETTINGS;

export type Control =
  | {
      kind: 'number';
      min?: number;
      max?: number;
      step?: number;
      auto?: boolean;
    }
  | { kind: 'color' }
  | { kind: 'text'; presets: readonly string[] }
  | { kind: 'choice'; options: readonly { value: string; label: string }[] };

export interface SettingUi {
  readonly label: string;
  /** Shown by the `(?)` toggle tip — see the note below on why it lives here. */
  readonly help: string;
  readonly control: Control;
}

/**
 * How each registry row is presented, and what its `(?)` says.
 *
 * **This is UI copy, not domain data, and that is why it is here** rather than a
 * `help` field on `SettingDef`. `shared/domain` is pure — no `@angular/*` deps —
 * and this text is i18n'd, so it needs `$localize`; putting it in the registry
 * would drag Angular i18n onto the domain floor. It also describes the *control*,
 * not the setting's semantics.
 *
 * The `Record<SettingKey, …>` is load-bearing: add a row to `SETTINGS` and this
 * **fails to compile** until its copy exists. The registry keeps its "a new
 * setting appears with zero extra wiring" property for the control, while the
 * copy cannot go silently missing.
 */
export const SETTING_UI: Record<SettingKey, SettingUi> = {
  scale: {
    label: $localize`:@@setting.scale:Scale`,
    help: $localize`:@@setting.scale.help:How big the text is. "Auto" fills the page as far as it can — a fixed number may overflow it.`,
    control: { kind: 'number', min: 0.1, max: 5, step: 0.1, auto: true },
  },
  columns: {
    label: $localize`:@@setting.columns:Columns`,
    help: $localize`:@@setting.columns.help:Split the song into columns so a long one still fits a single page.`,
    control: { kind: 'number', min: 1, max: 6, step: 1 },
  },
  titlePosition: {
    label: $localize`:@@setting.titlePosition:Title position`,
    help: $localize`:@@setting.titlePosition.help:Across the top, or sideways up the left edge as a spine. The title block always hugs the top-left corner.`,
    control: {
      kind: 'choice',
      options: [
        { value: 'top', label: $localize`:@@setting.titlePosition.top:Top` },
        {
          value: 'left',
          label: $localize`:@@setting.titlePosition.left:Spine`,
        },
      ],
    },
  },
  titleLayout: {
    label: $localize`:@@setting.titleLayout:Title layout`,
    help: $localize`:@@setting.titleLayout.help:Whether the subtitle sits under the title or beside it.`,
    control: {
      kind: 'choice',
      options: [
        {
          value: 'stacked',
          label: $localize`:@@setting.titleLayout.stacked:Stacked`,
        },
        {
          value: 'inline',
          label: $localize`:@@setting.titleLayout.inline:Inline`,
        },
      ],
    },
  },
  aspectRatio: {
    label: $localize`:@@setting.aspectRatio:Aspect ratio`,
    help: $localize`:@@setting.aspectRatio.help:The shape of the page. Accepts A4, a ratio like 3:4, a fraction like 3/4, or a number. Crop it to your content to waste less space — printing keeps the shape and scales to fit.`,
    control: { kind: 'text', presets: ['A4', '16:9', '4:3', '1:1', '3:4'] },
  },
  chordColor: {
    label: $localize`:@@setting.chordColor:Chord colour`,
    help: $localize`:@@setting.chordColor.help:The colour of every chord in the song.`,
    control: { kind: 'color' },
  },
  chordSize: {
    label: $localize`:@@setting.chordSize:Chord size`,
    help: $localize`:@@setting.chordSize.help:Chord size relative to the lyrics.`,
    control: { kind: 'number', min: 0.5, max: 3, step: 0.1 },
  },
};

/** The registry rows a given scope is allowed to override (ADR-0006). */
export function keysForScope(scope: Scope): SettingKey[] {
  return (Object.keys(SETTINGS) as SettingKey[]).filter((key) =>
    scope === 'global'
      ? true // Global defines every setting — it is the base of the cascade.
      : (SETTINGS[key].scopes as readonly string[]).includes(scope),
  );
}
