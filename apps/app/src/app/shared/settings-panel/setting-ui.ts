// Settings UI copy + control mapping — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes), §5.2 (where help text lives)

import { SETTINGS, SCOPES } from '@achordeon/shared/domain';

export type Scope = (typeof SCOPES)[number];
export type SettingKey = keyof typeof SETTINGS;

export interface Option {
  readonly value: string;
  readonly label: string;
}

export type Control =
  /** Big-arrow stepper — a native number spinner is a ~10px hit target. */
  | { kind: 'stepper'; min: number; max: number; step: number }
  | { kind: 'color' }
  /**
   * A named list plus an escape hatch. `custom: true` reveals a free-text field,
   * so the common answers are one tap and the long tail stays reachable — which
   * is exactly the shape of `aspectRatio` and `scale`.
   */
  | { kind: 'select'; options: readonly Option[]; custom?: boolean }
  | { kind: 'choice'; options: readonly Option[] };

/** Rows are grouped so the panel reads as sections, not a wall of inputs. */
export type Group = 'page' | 'title' | 'chords';

export const GROUPS: readonly Group[] = ['page', 'title', 'chords'];

export const GROUP_LABELS: Record<Group, string> = {
  page: $localize`:@@settingGroup.page:Page`,
  title: $localize`:@@settingGroup.title:Title`,
  chords: $localize`:@@settingGroup.chords:Chords`,
};

export interface SettingUi {
  readonly label: string;
  /** Shown by the `(?)` toggle tip — see the note below on why it lives here. */
  readonly help: string;
  readonly group: Group;
  readonly control: Control;
}

/**
 * Aspect-ratio presets.
 *
 * **Named ratios only — no device names.** A row like "Galaxy Tab S11" claims an
 * exact spec, and a wrong one is invisible: the song just renders cropped and
 * nobody notices. These are ratios that are true by definition. `Custom…` still
 * takes any `N:N`, `N/N`, number, or `A4`, so nothing is unreachable.
 */
const ASPECT_PRESETS: readonly Option[] = [
  { value: 'A4', label: $localize`:@@aspect.a4:A4 (210:297)` },
  { value: '1', label: $localize`:@@aspect.square:Square (1:1)` },
  { value: '16:9', label: '16:9' },
  { value: '16:10', label: '16:10' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

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
    group: 'page',
    control: {
      kind: 'select',
      custom: true,
      options: [
        { value: 'auto', label: $localize`:@@scale.auto:Auto (fit the page)` },
        { value: '1', label: $localize`:@@scale.one:1 (actual size)` },
      ],
    },
  },
  columns: {
    label: $localize`:@@setting.columns:Columns`,
    help: $localize`:@@setting.columns.help:Split the song into columns so a long one still fits a single page.`,
    group: 'page',
    control: { kind: 'stepper', min: 1, max: 6, step: 1 },
  },
  aspectRatio: {
    label: $localize`:@@setting.aspectRatio:Aspect ratio`,
    help: $localize`:@@setting.aspectRatio.help:The shape of the page. Crop it to your content to waste less space — printing keeps the shape and scales to fit. Custom accepts a ratio like 3:4, a fraction like 3/4, or a number.`,
    group: 'page',
    control: { kind: 'select', custom: true, options: ASPECT_PRESETS },
  },
  titlePosition: {
    label: $localize`:@@setting.titlePosition:Position`,
    help: $localize`:@@setting.titlePosition.help:Across the top, or sideways up the left edge as a spine. The title block always hugs the top-left corner.`,
    group: 'title',
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
    label: $localize`:@@setting.titleLayout:Layout`,
    help: $localize`:@@setting.titleLayout.help:Whether the subtitle sits under the title or beside it.`,
    group: 'title',
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
  chordColor: {
    label: $localize`:@@setting.chordColor:Colour`,
    help: $localize`:@@setting.chordColor.help:The colour of every chord in the song.`,
    group: 'chords',
    control: { kind: 'color' },
  },
  chordSize: {
    label: $localize`:@@setting.chordSize:Size`,
    help: $localize`:@@setting.chordSize.help:Chord size relative to the lyrics.`,
    group: 'chords',
    control: { kind: 'stepper', min: 0.5, max: 3, step: 0.1 },
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
