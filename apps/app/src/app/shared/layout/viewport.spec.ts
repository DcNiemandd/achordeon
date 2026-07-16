// Viewport — Epic 13
// Spec: PRD-UI-SHELL.md §6

import { TestBed } from '@angular/core/testing';
import { setViewportWidth } from '../../../test-setup';
import { Viewport } from './viewport';

describe('Viewport', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--bp-compact');
  });

  function inject(): Viewport {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(Viewport);
  }

  it('is roomy above the breakpoint and compact below it', () => {
    setViewportWidth(1400);
    expect(inject().isCompact()).toBe(false);

    setViewportWidth(800);
    expect(inject().isCompact()).toBe(true);
  });

  it('reacts to a resize without a re-injection', () => {
    setViewportWidth(1400);
    const viewport = inject();
    expect(viewport.isCompact()).toBe(false);

    setViewportWidth(600);

    expect(viewport.isCompact()).toBe(true);
  });

  it('reads the breakpoint from CSS so TS cannot drift from the stylesheet', () => {
    // The real value comes from $bp-compact in _breakpoints.scss. Prove the
    // service honours whatever CSS says rather than a hard-coded copy.
    document.documentElement.style.setProperty('--bp-compact', '600px');
    setViewportWidth(800);

    expect(inject().isCompact()).toBe(false);

    document.documentElement.style.setProperty('--bp-compact', '900px');

    expect(inject().isCompact()).toBe(true);
  });

  it('falls back to 1200 when the stylesheet has not applied', () => {
    document.documentElement.style.removeProperty('--bp-compact');
    setViewportWidth(800);

    expect(inject().isCompact()).toBe(true);
  });
});
