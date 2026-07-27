// Settings panel — Epic 13
// Spec: docs/superpowers/specs/2026-07-27-aspect-ratio-devices-design.md

import { TestBed, type ComponentFixture } from '@angular/core/testing';
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

  let fixture: ComponentFixture<SettingsPanel>;
  let patches: Record<string, unknown>[];

  function mount(shape: string | null = '131:284'): void {
    FakeScreen.shape = shape;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ScreenShape, useClass: FakeScreen }],
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

  it('leaves a flat list flat', () => {
    // titleFont is a closed list of four; headings there would be noise.
    mount();

    expect(picker('titleFont').querySelectorAll('optgroup')).toHaveLength(0);
    expect(
      picker('titleFont').querySelectorAll('option').length,
    ).toBeGreaterThan(0);
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

  it('ignores the blank display row', () => {
    // Blank means "the value is something you typed", not a choice.
    mount();

    pick('aspectRatio', '');

    expect(patches).toEqual([]);
  });
});
