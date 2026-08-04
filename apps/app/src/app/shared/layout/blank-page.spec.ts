// Blank page — the frame the render sits in
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md (the turn)

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BlankPage } from './blank-page';

@Component({
  imports: [BlankPage],
  template: `
    <app-blank-page
      [ratio]="ratio()"
      [isTurned]="isTurned()"
      [zoom]="zoom()"
      [panX]="panX()"
      [panY]="panY()"
    />
  `,
})
class Host {
  readonly ratio = signal(210 / 297);
  readonly isTurned = signal(false);
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
}

describe('BlankPage', () => {
  function mount(): { host: Host; page: () => HTMLElement } {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return {
      host: fixture.componentInstance,
      page: () => {
        fixture.detectChanges();
        return fixture.nativeElement.querySelector('.page') as HTMLElement;
      },
    };
  }

  it('gives an untouched page no transform at all', () => {
    // Not an identity one: a fitted page should not be handed a containing block
    // it never asked for.
    expect(mount().page().style.transform).toBe('');
  });

  it('draws a magnified page exactly as it did before the turn existed', () => {
    const { host, page } = mount();
    host.zoom.set(2);
    host.panX.set(10);
    host.panY.set(-4);

    expect(page().style.transform).toBe('translate(10px, -4px) scale(2)');
  });

  describe('turned', () => {
    it('rotates counter-clockwise, like the title spine', () => {
      const { host, page } = mount();
      host.isTurned.set(true);

      expect(page().style.transform).toContain('rotate(-90deg)');
    });

    // The load-bearing detail (ADR-0013): written the other way round, the
    // translate would run in the rotated frame and every pan coordinate in
    // zoom.ts would silently change meaning.
    it('puts the rotation OUTSIDE the pan and the scale', () => {
      const { host, page } = mount();
      host.isTurned.set(true);
      host.zoom.set(2);
      host.panX.set(10);
      host.panY.set(-4);

      expect(page().style.transform).toBe(
        'rotate(-90deg) translate(10px, -4px) scale(2)',
      );
    });

    it('turns a fitted page with nothing else in the transform', () => {
      const { host, page } = mount();
      host.isTurned.set(true);

      expect(page().style.transform).toBe('rotate(-90deg)');
    });

    // Both must come from ONE flag. Under this transform the pre-rotation box is
    // wider than the desk and only the rotation brings it back on screen, so a
    // class without a rotation (or the reverse) is a page hanging off both edges.
    it('marks the box and rotates it together, never one alone', () => {
      const { host, page } = mount();
      expect(page().classList.contains('is-turned')).toBe(false);
      expect(page().style.transform).toBe('');

      host.isTurned.set(true);
      expect(page().classList.contains('is-turned')).toBe(true);
      expect(page().style.transform).toContain('rotate(-90deg)');

      host.isTurned.set(false);
      expect(page().classList.contains('is-turned')).toBe(false);
      expect(page().style.transform).toBe('');
    });
  });

  it('hands the page shape through as a custom property', () => {
    const { host, page } = mount();
    host.ratio.set(1.5);

    expect(page().style.getPropertyValue('--page-ratio')).toBe('1.5');
  });
});
