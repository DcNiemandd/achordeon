// Aspect-ratio picker contents — Epic 13

import { tryParseAspectRatio } from '@achordeon/shared/render-core';
import {
  ASPECT_OPTION_GROUPS,
  MATCH_SCREEN,
  allAspectOptions,
} from './aspect-options';

describe('ASPECT_OPTION_GROUPS', () => {
  const values = () =>
    allAspectOptions()
      .map((opt) => opt.value)
      .filter((value) => value !== MATCH_SCREEN);

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

  it('keeps the measure-my-screen row out of the stored values', () => {
    const sentinel = allAspectOptions().filter(
      (opt) => opt.value === MATCH_SCREEN,
    );
    expect(sentinel).toHaveLength(1);
    // It must be unreadable as a ratio, or a stray one would render as A4 rather
    // than being refused.
    expect(tryParseAspectRatio(MATCH_SCREEN as never)).toBeNull();
  });
});
