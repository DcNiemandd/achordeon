// Aspect-ratio picker contents — Epic 13

import { tryParseAspectRatio } from '@achordeon/shared/render-core';
import {
  ASPECT_OPTION_GROUPS,
  MATCH_SCREEN,
  MATCH_SCREEN_SIDEWAYS,
  allAspectOptions,
  isMatchScreen,
} from './aspect-options';

describe('ASPECT_OPTION_GROUPS', () => {
  const values = () =>
    allAspectOptions()
      .map((opt) => opt.value)
      .filter((value) => !isMatchScreen(value));

  it('offers only values the renderer can read', () => {
    // The same check the text field makes. A preset the renderer refuses would be
    // stored and then silently drawn as A4 — a setting that looks set and is not.
    for (const value of values()) {
      expect(tryParseAspectRatio(value as never)).not.toBeNull();
    }
  });

  it('never repeats a value', () => {
    // Two options sharing a value make the picker display the FIRST one's label
    // after the second is chosen — pick "Galaxy S24", get told "iPhone 13 mini".
    // Families that share a shape share a row instead.
    const all = values();

    expect(new Set(all).size).toBe(all.length);
  });

  it('has no empty groups and no unnamed ones', () => {
    for (const group of ASPECT_OPTION_GROUPS) {
      expect(group.label).not.toBe('');
      expect(group.options.length).toBeGreaterThan(0);
    }
  });

  it('shows every device row the ratio it will set', () => {
    // A device row is a claim about hardware, and the point of printing the ratio
    // beside the name is that the claim can be checked against "Match this
    // screen" by anyone holding the device.
    const deviceGroups = ASPECT_OPTION_GROUPS.filter((group) =>
      group.options.some((opt) => /iPhone|iPad|Pixel|Galaxy/.test(opt.label)),
    );
    expect(deviceGroups.length).toBeGreaterThan(0);

    for (const group of deviceGroups) {
      for (const opt of group.options) {
        expect(opt.label).toContain(opt.value);
      }
    }
  });

  it('keeps the measure-my-screen rows out of the stored values', () => {
    for (const sentinel of [MATCH_SCREEN, MATCH_SCREEN_SIDEWAYS]) {
      expect(
        allAspectOptions().filter((opt) => opt.value === sentinel),
      ).toHaveLength(1);
      // Each must be unreadable as a ratio, or a stray one would render as A4
      // rather than being refused.
      expect(tryParseAspectRatio(sentinel as never)).toBeNull();
    }
  });

  it('knows both measurement rows and nothing else', () => {
    // The two sentinels behave alike everywhere — hidden together where there is
    // no screen, resolved together when picked — so every site asks this one
    // question rather than remembering both names.
    expect(isMatchScreen(MATCH_SCREEN)).toBe(true);
    expect(isMatchScreen(MATCH_SCREEN_SIDEWAYS)).toBe(true);
    expect(isMatchScreen('A4')).toBe(false);
    expect(isMatchScreen('16:9')).toBe(false);
  });
});
