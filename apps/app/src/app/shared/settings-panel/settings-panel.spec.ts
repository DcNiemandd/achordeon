// Settings panel — Epic 13
// Spec: docs/superpowers/specs/2026-07-27-aspect-ratio-devices-design.md

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FontLoader } from '@achordeon/shared/data-access';
import {
  BODY_FONT,
  BUNDLED_CATALOG,
  BUNDLED_FONTS,
  DEFAULT_BODY_FONT,
  DEFAULT_TUNING,
  isBodyCapable,
} from '@achordeon/shared/render-core';
import { ScreenShape } from '../layout';
import { ASPECT_OPTION_GROUPS, MATCH_SCREEN } from './aspect-options';
import { SettingsPanel } from './settings-panel';

describe('SettingsPanel', () => {
  /** A stand-in for the device, so a test can be a phone or be headless. */
  class FakeScreen {
    static shape: string | null = '131:284';
    detect(): string | null {
      return FakeScreen.shape;
    }
  }

  /** The real loader fetches; here we only care what it was asked for. */
  class FakeFonts {
    /** The families a device has. Bundled-only, which is what a fresh one has. */
    readonly catalog = BUNDLED_CATALOG;
    readonly asked: { families: readonly string[]; weights?: unknown }[] = [];
    ensure(families: readonly string[], weights?: unknown): Promise<void> {
      this.asked.push({ families, weights });
      return Promise.resolve();
    }
  }

  let fixture: ComponentFixture<SettingsPanel>;
  let patches: Record<string, unknown>[];

  function mount(shape: string | null = '131:284'): void {
    FakeScreen.shape = shape;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ScreenShape, useClass: FakeScreen },
        { provide: FontLoader, useClass: FakeFonts },
      ],
    });
    fixture = TestBed.createComponent(SettingsPanel);
    fixture.componentRef.setInput('scope', 'global');
    patches = [];
    fixture.componentInstance.changed.subscribe((patch) => patches.push(patch));
    fixture.detectChanges();
  }

  function picker(key: string): HTMLSelectElement {
    const el = fixture.nativeElement.querySelector(
      `[data-testid="select-${key}"]`,
    );
    expect(el).not.toBeNull();
    return el as HTMLSelectElement;
  }

  /** Choose an option the way a user does — by its value. */
  function pick(key: string, value: string): void {
    const select = picker(key);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  /**
   * The picker's rows, read from the list itself rather than named here.
   *
   * Which shapes are worth offering is a question the list gets to answer on its
   * own — a test that hard-codes "41:59" or the heading "Phones" fails the moment
   * a row is added, reworded, or parked behind a comment, and says "the panel is
   * broken" when it means "the list changed".
   */
  const listed = ASPECT_OPTION_GROUPS.flatMap((group) => group.options).filter(
    (opt) => opt.value !== MATCH_SCREEN,
  );

  it('stores the ratio behind a picked row', () => {
    mount();

    // The last one, so this covers the whole list reaching the DOM and not just
    // the top of it.
    const last = listed[listed.length - 1];
    pick('aspectRatio', last.value);

    expect(patches).toEqual([{ aspectRatio: last.value }]);
  });

  it('renders every group the list declares, under its own heading', () => {
    mount();

    const headings = [
      ...picker('aspectRatio').querySelectorAll('optgroup'),
    ].map((group) => group.getAttribute('label'));

    expect(headings).toEqual(ASPECT_OPTION_GROUPS.map((group) => group.label));
  });

  it('keeps the option that is not a family out of the shelves', () => {
    // "Same as song" is a sentinel, not a family (ADR-0017), so it must not end
    // up filed under a category heading that would be lying about it.
    mount();

    const select = picker('titleFont');
    expect(select.querySelectorAll('optgroup').length).toBeGreaterThan(0);
    expect(
      [...select.querySelectorAll('optgroup option')].map((opt) =>
        opt.getAttribute('value'),
      ),
    ).not.toContain(BODY_FONT);
    expect(
      [...select.querySelectorAll('option')].map((opt) =>
        opt.getAttribute('value'),
      ),
    ).toContain(BODY_FONT);
  });

  describe('match this screen', () => {
    it('stores the measured shape, never the sentinel', () => {
      mount('284:131');

      pick('aspectRatio', MATCH_SCREEN);

      // The value has to survive a sync to another device, so what is stored is
      // the measurement — not a token that would re-resolve on a desktop.
      expect(patches).toEqual([{ aspectRatio: '284:131' }]);
    });

    it('is offered when there is a screen to measure', () => {
      mount('131:284');

      const values = [...picker('aspectRatio').querySelectorAll('option')].map(
        (opt) => opt.getAttribute('value'),
      );

      expect(values).toContain(MATCH_SCREEN);
    });

    it('is absent when there is not', () => {
      // A button that does nothing is worse than no button.
      mount(null);

      const values = [...picker('aspectRatio').querySelectorAll('option')].map(
        (opt) => opt.getAttribute('value'),
      );

      expect(values).not.toContain(MATCH_SCREEN);
      expect(
        picker('aspectRatio').querySelectorAll('optgroup').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('font sample', () => {
    /**
     * Feed a value back in, the way the host does.
     *
     * The panel is a controlled form: picking an option emits a patch and
     * changes nothing on screen until the owner of the value says so. So a test
     * about what the panel *draws* sets the input, not the select.
     */
    function chosen(value: string): void {
      fixture.componentRef.setInput('values', { titleFont: value });
      fixture.detectChanges();
    }

    function sample(key: string): HTMLElement {
      const el = fixture.nativeElement.querySelector(
        `[data-testid="sample-${key}"]`,
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }

    /**
     * The face each family is drawn in, read off the catalog rather than named
     * here — the same row the page resolves against. A test that spelled
     * "Caveat" out would pass while the sample showed a face the render had
     * stopped using.
     */
    it.each(BUNDLED_FONTS)('draws $id in its own face', (family) => {
      mount();

      chosen(family.id);

      expect(sample('titleFont').style.fontFamily).toContain(family.family);
    });

    it('shows the song\'s own face for "same as song"', () => {
      // The reason the sample exists: that option names no font, so the label
      // cannot say what it looks like and only the letters can.
      mount();

      chosen(BODY_FONT);

      expect(sample('titleFont').style.fontFamily).toContain(
        DEFAULT_TUNING.fontFamily,
      );
    });

    it('shows the body face for a family this device does not have', () => {
      // A song from a sender who had a font this install lacks. The value stays
      // in the record (ADR-0017); the page it draws is the default one.
      mount();

      chosen('custom:not-installed');

      expect(sample('titleFont').style.fontFamily).toContain(
        DEFAULT_TUNING.fontFamily,
      );
    });

    it('asks the loader for the face it is about to draw', () => {
      // On the Settings page nothing has rendered a song, so the bytes for a
      // title face have never been fetched — a sample that did not ask for them
      // would quietly draw in the CSS fallback.
      mount();

      const script = BUNDLED_FONTS.find((one) => one.category === 'script');
      chosen(script?.id ?? '');

      const fonts = TestBed.inject(FontLoader) as unknown as FakeFonts;
      const last = fonts.asked[fonts.asked.length - 1];
      expect(last.families).toContain(script?.id);
      // One line at one weight — not a quarter-megabyte of bold nobody sees.
      expect(last.weights).toEqual(['normal']);
    });

    it('is hidden from screen readers', () => {
      // It repeats the chosen option's own words; what it adds is the shape of
      // the letters, which is not something that can be read out.
      mount();

      expect(sample('titleFont').getAttribute('aria-hidden')).toBe('true');
    });

    it('is only on rows whose value is a font', () => {
      mount();

      const samples = fixture.nativeElement.querySelectorAll(
        '[data-testid^="sample-"]',
      );
      expect(
        [...samples].map((el: Element) => el.getAttribute('data-testid')),
      ).toEqual(['sample-bodyFont', 'sample-italicFont', 'sample-titleFont']);
    });
  });

  describe('a family short of a face', () => {
    /** The first bundled family that cannot set a whole song on its own. */
    const short = BUNDLED_FONTS.find((one) => !isBodyCapable(one));

    function row(key: string): Element | null {
      return fixture.nativeElement.querySelector(`[data-testid="${key}"]`);
    }

    function setBody(value: string): void {
      fixture.componentRef.setInput('values', { bodyFont: value });
      fixture.detectChanges();
    }

    it('says which face is borrowed, and from whom', () => {
      mount();

      setBody(short?.id ?? '');

      const note = row('note-bodyFont');
      expect(note).not.toBeNull();
      // Named, not just flagged: "some faces are borrowed" is not actionable.
      expect(note?.textContent).toContain(DEFAULT_TUNING.fontFamily);
    });

    it('enables the donor row only once something is borrowing', () => {
      // Disabled rather than absent: a row that came and went as the font above
      // it changed would move every control below it, so choosing a font would
      // make the panel jump under the pointer.
      mount();

      expect(picker('italicFont').disabled).toBe(true);

      setBody(short?.id ?? '');

      expect(picker('italicFont').disabled).toBe(false);
    });

    it('says nothing for a family that draws all of its own', () => {
      mount();

      setBody(DEFAULT_BODY_FONT);

      expect(row('note-bodyFont')).toBeNull();
    });
  });

  it('ignores the blank display row', () => {
    // Blank means "the value is something you typed", not a choice.
    mount();

    pick('aspectRatio', '');

    expect(patches).toEqual([]);
  });
});
