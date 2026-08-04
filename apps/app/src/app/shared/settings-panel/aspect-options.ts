// Aspect-ratio picker contents — Epic 13
// Spec: docs/superpowers/specs/2026-07-27-aspect-ratio-devices-design.md
//
// Device figures are **CSS-pixel screen sizes**, sourced from yesviz.com
// (https://yesviz.com/viewport/ and https://yesviz.com/devices.php). CSS pixels,
// not panel resolutions, because that is what `window.screen` reports and
// therefore what "Match this screen" writes — see the honesty note below.

import type { Option, OptionGroup } from './setting-ui';

/**
 * Not a value — the "measure my screen" row.
 *
 * A sentinel rather than a second control beside the picker, because "the shape
 * of this device" is one of the answers to "what shape is the page", not a mode
 * you switch into. The panel swaps it for the measured ratio and stores *that*:
 * a phone that picks this row saves `131:284`, so the value still means the phone
 * after it syncs to a desktop.
 *
 * `@` cannot begin any ratio the renderer accepts, so this can never be confused
 * with a real value — and if it somehow reached the text field, `validate`
 * rejects it like any other nonsense.
 */
export const MATCH_SCREEN = '@screen';

/**
 * The same measurement, the other way round — this device as it would be held
 * sideways.
 *
 * A second row rather than a hint under the first, because the alternative is
 * asking the reader to physically turn the phone before tapping, and half of
 * them are on a device with rotation lock on, where turning it changes nothing
 * this app can see. What it writes is still an ordinary reduced ratio (`284:131`
 * where {@link MATCH_SCREEN} would write `131:284`), so it syncs and reads
 * exactly like every other value here — and it is what makes a Song landscape
 * in the first place (CONTEXT.md §Aspect ratio).
 */
export const MATCH_SCREEN_SIDEWAYS = '@screen-sideways';

/** Is this row a measurement rather than a value? Both sentinels behave alike
 * everywhere they are met — hidden together where there is no screen to read,
 * and resolved together into a real ratio when picked — so the two names are
 * asked for once, here, rather than remembered at every site. */
export function isMatchScreen(value: string): boolean {
  return value === MATCH_SCREEN || value === MATCH_SCREEN_SIDEWAYS;
}

/**
 * What the aspect-ratio picker offers.
 *
 * **Device rows exist now, and they are held to a testable claim.** An earlier
 * version of this list refused them outright: "a row like 'Galaxy Tab S11' claims
 * an exact spec, and a wrong one is invisible — the song just renders cropped and
 * nobody notices." That risk is real, so every device row's value is *exactly what
 * `Match this screen` writes on that device* — the reduced CSS-pixel screen
 * fraction, not the marketing ratio. `iPhone 15` is `131:284`, not `9:19.5`. Which
 * means a wrong row is **checkable by anyone holding the device**: pick the row,
 * pick `Match this screen`, compare. Every label carries its ratio for the same
 * reason — the claim is visible before you act on it.
 *
 * **Every value appears exactly once in the whole list** (asserted in the spec).
 * Two options sharing a value would make the picker show the *first* one's label
 * after the second was chosen — pick "Galaxy S24", get told "iPhone 13 mini". So
 * families that share a shape share a row, and where a device's exact shape *is*
 * a named ratio the device names ride along on that named row rather than
 * duplicating it.
 *
 * **No laptop group**: laptop shapes *are* the named landscape ratios, so such a
 * row would add a name and no information.
 *
 * Device names are proper nouns and are not localized; group labels are.
 */
export const ASPECT_OPTION_GROUPS: readonly OptionGroup[] = [
  {
    label: $localize`:@@aspect.group.device:This device`,
    options: [
      {
        value: MATCH_SCREEN,
        label: $localize`:@@aspect.matchScreen:Match this screen`,
      },
      {
        value: MATCH_SCREEN_SIDEWAYS,
        label: $localize`:@@aspect.matchScreenSideways:Match this screen, sideways`,
      },
    ],
  },
  {
    label: $localize`:@@aspect.group.paper:Paper`,
    options: [
      // 'A4' stays the stored value, not '210:297': the renderer special-cases it
      // and CONTEXT.md §Aspect ratio promises the input accepts it by name. It is
      // also every ISO A size, which no single pixel pair could claim.
      { value: 'A4', label: $localize`:@@aspect.a4:A4 (210:297)` },
      { value: '17:22', label: $localize`:@@aspect.letter:Letter (17:22)` },
    ],
  },
  {
    // Tallest to squarest, so the list reads as a scale rather than a set.
    label: $localize`:@@aspect.group.portrait:Portrait`,
    options: [
      { value: '9:19.5', label: '9:19.5' },
      { value: '9:16', label: '9:16' },
      { value: '5:8', label: '5:8 (Galaxy Tab)' },
      { value: '2:3', label: '2:3 (Surface Pro)' },
      { value: '3:4', label: '3:4 (iPad 9.7", iPad 10.2")' },
      // `1:1`, not `1`: a preset's value is stored verbatim, so it should be a
      // value the `aspectRatio` type actually allows. (The renderer parses a bare
      // number too — CONTEXT.md promises that for the text input — but a preset
      // has no excuse to lean on it.)
      { value: '1:1', label: $localize`:@@aspect.square:Square (1:1)` },
    ],
  },
  {
    label: $localize`:@@aspect.group.landscape:Landscape`,
    options: [
      { value: '21:9', label: '21:9' },
      { value: '16:9', label: '16:9' },
      { value: '16:10', label: '16:10' },
      { value: '3:2', label: '3:2' },
      { value: '4:3', label: '4:3' },
    ],
  },
  // TODO: analyze what values would be most useful to add, now there is too much not readable.
  // {
  //   // Newest first, by brand — how the list is actually scanned. Ordering these
  //   // by ratio would interleave the brands, and the ratios are within 1% of one
  //   // another anyway: that is the hardware, not a rounding bug, and it is why
  //   // nobody finds their row by comparing fourth decimal places.
  //   label: $localize`:@@aspect.group.phones:Phones`,
  //   options: [
  //     { value: '110:239', label: 'iPhone 16 Pro Max (110:239)' },
  //     { value: '201:437', label: 'iPhone 16 Pro (201:437)' },
  //     { value: '131:284', label: 'iPhone 14 Pro, 15, 16 (131:284)' },
  //     {
  //       value: '215:466',
  //       label: 'iPhone 14 Pro Max, 15 Plus, 16 Plus (215:466)',
  //     },
  //     { value: '195:422', label: 'iPhone 12, 13, 14 (195:422)' },
  //     {
  //       value: '214:463',
  //       label: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus (214:463)',
  //     },
  //     // 360×780 exactly, on both — the one row where an iPhone and a Galaxy have
  //     // the same shape, so they share it rather than fight over the value.
  //     {
  //       value: '6:13',
  //       label: 'iPhone 12 mini, 13 mini, Galaxy S21–S25 (6:13)',
  //     },
  //     { value: '375:812', label: 'iPhone X, XS, 11 Pro (375:812)' },
  //     { value: '207:448', label: 'iPhone XR, 11, 11 Pro Max (207:448)' },
  //     { value: '375:667', label: 'iPhone SE, 8 (375:667)' },
  //     { value: '412:915', label: 'Pixel 6, 7, 8 (412:915)' },
  //     { value: '45:101', label: 'Pixel 9 (45:101)' },
  //   ],
  // },
  // {
  //   // Short, because three tablet shapes are named ratios and ride on the rows
  //   // above: iPad 9.7"/10.2" is 3:4, Galaxy Tab is 5:8, Surface Pro is 2:3.
  //   label: $localize`:@@aspect.group.tablets:Tablets`,
  //   options: [
  //     { value: '512:683', label: 'iPad Pro 12.9", 13" (512:683)' },
  //     { value: '139:199', label: 'iPad Pro 11" (139:199)' },
  //     { value: '41:59', label: 'iPad Air 11", iPad 10.9" (41:59)' },
  //     { value: '744:1133', label: 'iPad mini 6, 7 (744:1133)' },
  //   ],
  // },
];

/** Every row in the picker, groups flattened away. */
export function allAspectOptions(): readonly Option[] {
  return ASPECT_OPTION_GROUPS.flatMap((group) => group.options);
}
