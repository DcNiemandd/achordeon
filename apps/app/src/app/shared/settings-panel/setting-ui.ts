// Settings UI copy + control mapping — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes), §5.2 (where help text lives)

import { SETTINGS, SCOPES } from '@achordeon/shared/domain';
import { tryParseAspectRatio } from '@achordeon/shared/render-core';

export type Scope = (typeof SCOPES)[number];
export type SettingKey = keyof typeof SETTINGS;

export interface Option {
  readonly value: string;
  readonly label: string;
}

export type Control =
  /**
   * Big-arrow stepper — a native number spinner is a ~10px hit target.
   *
   * `presets` are named answers that are **not numbers** and sit beside the
   * stepper as buttons. `scale` is the case: "auto" is a real value the renderer
   * understands, but everything else about the setting is a number you nudge.
   */
  | {
      kind: 'stepper';
      min: number;
      max: number;
      step: number;
      presets?: readonly Option[];
    }
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
  /**
   * Reject a typed value, saying why; `null` when it is fine.
   *
   * Only for rows whose legal values a `Control` cannot describe on its own — a
   * stepper's range and whole-ness are already in its `min`/`max`/`step`, so the
   * panel derives those itself. `aspectRatio` is the case that needs this: "3:4",
   * "0.75" and "A4" are all legal and nothing about a text box says so.
   *
   * **Defers to the renderer's own parser** rather than restating it. A form with
   * its own copy of the rule would eventually disagree with the code that draws
   * the page, and the user would be the one to find out.
   */
  readonly validate?: (raw: string) => string | null;
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
  // `1:1`, not `1`: a preset's value is stored verbatim, so it should be a value
  // the `aspectRatio` type actually allows. (The renderer parses a bare number
  // too — CONTEXT.md promises that for the text input — but a preset has no
  // excuse to lean on it.)
  { value: '1:1', label: $localize`:@@aspect.square:Square (1:1)` },
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
    // A stepper, not a text box with a picker: every value but one is a number,
    // and nudging it is how you actually find the size you want. 0.01 because
    // the difference between 1.00 and 1.05 is visible on a full page.
    control: {
      kind: 'stepper',
      min: 0.1,
      max: 5,
      step: 0.01,
      presets: [{ value: 'auto', label: $localize`:@@scale.auto:Auto` }],
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
    // The renderer's own reader, asked whether it could make sense of the text
    // (see `tryParseAspectRatio`). Anything it refuses would have been stored and
    // then silently drawn as A4 — a setting that looks saved and does nothing.
    validate: (raw) =>
      tryParseAspectRatio(raw.trim() as never) === null
        ? $localize`:@@settings.error.ratio:Use a ratio like 3:4, a fraction like 3/4, a number, or A4.`
        : null,
  },
  padding: {
    label: $localize`:@@setting.padding:Padding`,
    help: $localize`:@@setting.padding.help:The white border between the song and the edge of the page. Measured in text sizes, so it stays in proportion however big the song is printed. A songbook's print margin is added on top of this.`,
    group: 'page',
    control: { kind: 'stepper', min: 0, max: 4, step: 0.25 },
  },
  contentX: {
    label: $localize`:@@setting.contentX:Horizontal`,
    help: $localize`:@@setting.contentX.help:Where the song sits across the page when it does not fill the width. Left hugs the corner.`,
    group: 'page',
    control: {
      kind: 'choice',
      options: [
        { value: 'left', label: $localize`:@@setting.contentX.left:Left` },
        {
          value: 'center',
          label: $localize`:@@setting.contentX.center:Center`,
        },
        { value: 'right', label: $localize`:@@setting.contentX.right:Right` },
      ],
    },
  },
  contentY: {
    label: $localize`:@@setting.contentY:Vertical`,
    help: $localize`:@@setting.contentY.help:Where the song sits down the page when it does not fill the height. Top hugs the corner.`,
    group: 'page',
    control: {
      kind: 'choice',
      options: [
        { value: 'top', label: $localize`:@@setting.contentY.top:Top` },
        {
          value: 'middle',
          label: $localize`:@@setting.contentY.middle:Middle`,
        },
        {
          value: 'bottom',
          label: $localize`:@@setting.contentY.bottom:Bottom`,
        },
      ],
    },
  },
  titleFont: {
    label: $localize`:@@setting.titleFont:Font`,
    help: $localize`:@@setting.titleFont.help:The face the title and subtitle are set in. They always share one — they are a single title block. Everything else stays in the song's own font.`,
    group: 'title',
    // A dropdown, not a segmented row: four side-by-side buttons would overflow
    // the song-settings dialog. A closed list, so no free-text escape hatch — a
    // typed family name is not something the renderer could honour, and every
    // name here is a face the app really carries and can embed in a PDF.
    //
    // The labels name the *look*, not the family: a user picking a title face is
    // choosing between a serif and a handwritten one, and "Crimson Text" tells
    // them nothing they can act on. The family behind each is the render's
    // business (`resolveFontChoice`).
    control: {
      kind: 'select',
      options: [
        {
          value: 'body',
          label: $localize`:@@titleFont.body:Same as song`,
        },
        { value: 'serif', label: $localize`:@@titleFont.serif:Serif` },
        { value: 'display', label: $localize`:@@titleFont.display:Condensed` },
        { value: 'script', label: $localize`:@@titleFont.script:Handwritten` },
      ],
    },
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
