// Settings UI copy + control mapping — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes), §5.2 (where help text lives)

import { SETTINGS, SCOPES } from '@achordeon/shared/domain';
import {
  tryParseAspectRatio,
  type FontCategory,
} from '@achordeon/shared/render-core';
import { ASPECT_OPTION_GROUPS } from './aspect-options';

export type Scope = (typeof SCOPES)[number];
export type SettingKey = keyof typeof SETTINGS;

export interface Option {
  readonly value: string;
  readonly label: string;
}

/**
 * A named run of options inside a `select` — an `<optgroup>`.
 *
 * Only `select` takes these. A `choice` row is a handful of side-by-side buttons;
 * a list long enough to need headings is not a list you can lay out that way.
 */
export interface OptionGroup {
  readonly label: string;
  readonly options: readonly Option[];
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
   *
   * The list may be flat or grouped into `<optgroup>`s, and a row can mix the
   * two. Grouping is what lets `aspectRatio` carry thirty answers without
   * reading as thirty unrelated ones.
   */
  | {
      kind: 'select';
      options: readonly (Option | OptionGroup)[];
      custom?: boolean;
    }
  | { kind: 'choice'; options: readonly Option[] }
  /**
   * A family picked from the device's font library.
   *
   * The only control whose options this file does not hold: which families exist
   * is a fact about the device (ADR-0017), so the panel asks the catalog and this
   * row says which *role* is being picked for. A static list here would go stale
   * the moment a user installs a font.
   */
  | { kind: 'font'; role: FontRole };

/** Which of a song's faces a `font` row picks. */
export type FontRole = 'body' | 'title' | 'italic';

/** Rows are grouped so the panel reads as sections, not a wall of inputs. */
export type Group = 'page' | 'title' | 'fonts' | 'chords';

/**
 * `fonts` is a section rather than a row apiece under whatever each face
 * happens to style. The deciding reason is not taxonomy: adding a font to the
 * device needs exactly one home, and fonts scattered across two sections leave
 * it without one.
 */
export const GROUPS: readonly Group[] = ['page', 'title', 'fonts', 'chords'];

export const GROUP_LABELS: Record<Group, string> = {
  page: $localize`:@@settingGroup.page:Page`,
  title: $localize`:@@settingGroup.title:Title`,
  fonts: $localize`:@@settingGroup.fonts:Fonts`,
  chords: $localize`:@@settingGroup.chords:Chords`,
};

/**
 * A line of text drawn the way the current value would draw it.
 *
 * A label can only *name* a face, and every name is a guess at what the letters
 * look like — "Same as song" names nothing at all. The sample shows them.
 */
export interface Sample {
  readonly text: string;
  /** The family to fetch bytes for, as a catalog id. */
  readonly id: string;
  /** The CSS family plus its fallbacks, for the style binding. */
  readonly stack: string;
}

/** The line every font row draws under its picker, in the face it just chose. */
export const FONT_SAMPLE_TEXT = $localize`:@@titleFont.sample:Sample of font`;

/** What to call one face when telling the user it had to be borrowed. */
export const FACE_LABELS: Record<string, string> = {
  'normal-normal': $localize`:@@face.regular:regular`,
  'bold-normal': $localize`:@@face.bold:bold`,
  'normal-italic': $localize`:@@face.italic:italic`,
  'bold-italic': $localize`:@@face.boldItalic:bold italic`,
};

/** The warning a borrowed face earns: which ones, and whose they are. */
export function borrowedNote(faces: readonly string[], donor: string): string {
  const list = faces.map((face) => FACE_LABELS[face] ?? face).join(', ');
  return $localize`:@@fonts.borrowed:This font has no ${list}:faces:. Taken from ${donor}:font: instead.`;
}

/**
 * The headings a font picker groups its families under.
 *
 * The families themselves are *not* translated — they are proper names, and a
 * user who went looking for Oswald is looking for the word "Oswald". What is
 * translatable is the shelf it sits on.
 */
export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  mono: $localize`:@@fontCategory.mono:Monospace`,
  serif: $localize`:@@fontCategory.serif:Serif`,
  sans: $localize`:@@fontCategory.sans:Sans-serif`,
  display: $localize`:@@fontCategory.display:Condensed & display`,
  script: $localize`:@@fontCategory.script:Handwritten`,
  custom: $localize`:@@fontCategory.custom:Added by you`,
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
    help: $localize`:@@setting.aspectRatio.help:The shape of the page. Crop it to your content to waste less space — printing keeps the shape and scales to fit. Pick a ratio, a device, or "Match this screen" to use the shape of the one you are holding. Custom accepts a ratio like 3:4, a fraction like 3/4, or a number.`,
    group: 'page',
    control: { kind: 'select', custom: true, options: ASPECT_OPTION_GROUPS },
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
  blockGap: {
    label: $localize`:@@setting.blockGap:Block gap`,
    // Says what it does to the page, not what it multiplies. The second sentence
    // is the reason this row exists at all: it is the cheapest way to win room on
    // a song that will not fit, and nothing about a spacing control says so.
    help: $localize`:@@setting.blockGap.help:The gap between blocks — the space that separates a verse from a chorus. Measured in lines of lyrics, so it keeps its proportion however big the song is printed. Closing it up is often what fits a long song on one page: with Scale on Auto, the room you take out comes back as bigger text.`,
    group: 'page',
    // 0 is a real answer — blocks abut, which is how you squeeze the last verse
    // on. Tenths, because the difference between 0.8 and 0.9 of a line is one the
    // eye can see on a full page.
    control: { kind: 'stepper', min: 0, max: 4, step: 0.1 },
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
  bodyFont: {
    label: $localize`:@@setting.bodyFont:Song`,
    help: $localize`:@@setting.bodyFont.help:The face the song itself is set in — lyrics, chords and labels. The title has its own, which can be told to follow this one.`,
    group: 'fonts',
    control: { kind: 'font', role: 'body' },
  },
  italicFont: {
    label: $localize`:@@setting.italicFont:Borrowed from`,
    help: $localize`:@@setting.italicFont.help:Where a face the song's own font has not got is taken from — usually italics. Without one, italic text would slant on screen and come out upright in a PDF.`,
    group: 'fonts',
    // Only drawn while something is actually being borrowed: a control for a
    // face nothing needs is a control that does nothing.
    control: { kind: 'font', role: 'italic' },
  },
  titleFont: {
    label: $localize`:@@setting.titleFont:Title`,
    help: $localize`:@@setting.titleFont.help:The face the title and subtitle are set in. They always share one — they are a single title block. Everything else stays in the song's own font.`,
    group: 'fonts',
    // A dropdown, not a segmented row: side-by-side buttons would overflow the
    // song-settings dialog, and the list grows with every font installed.
    //
    // The options name the *families*, grouped by category. They used to name
    // the look instead — "Serif", "Handwritten" — which worked only while there
    // was exactly one of each; with a library there are two serifs and "Serif"
    // stops being a name. The look now lives in the `<optgroup>` heading, where
    // it is a shelf rather than a claim about one face.
    //
    // Which leaves a label doing the one thing no label does well: describing
    // letterforms. So the row also draws a sample in the chosen face, and
    // "Same as song" — which names no face at all — is the reason it must.
    control: { kind: 'font', role: 'title' },
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
  notation: {
    label: $localize`:@@setting.notation:Notation`,
    // Says what changes on the page, and — because this is the one setting a
    // musician could reasonably fear — that the song itself is not touched.
    help: $localize`:@@setting.notation.help:Which note names the chords are printed with. German writes H for B, and B for B flat. Only the printed page changes; the song is left exactly as you wrote it.`,
    group: 'chords',
    control: {
      kind: 'choice',
      options: [
        {
          value: 'english',
          label: $localize`:@@setting.notation.english:English (B)`,
        },
        {
          value: 'german',
          label: $localize`:@@setting.notation.german:German (H)`,
        },
      ],
    },
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
