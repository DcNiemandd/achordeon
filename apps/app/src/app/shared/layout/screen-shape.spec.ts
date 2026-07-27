// Screen shape — the device's own aspect ratio

import { TestBed } from '@angular/core/testing';
import { ScreenShape } from './screen-shape';

describe('ScreenShape', () => {
  const real = { width: window.screen.width, height: window.screen.height };

  function stubScreen(width: unknown, height: unknown): void {
    Object.defineProperty(window.screen, 'width', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(window.screen, 'height', {
      value: height,
      configurable: true,
    });
  }

  afterEach(() => stubScreen(real.width, real.height));

  function probe(): ScreenShape {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ScreenShape);
  }

  it('reports the screen as a reduced ratio', () => {
    stubScreen(393, 852);

    expect(probe().detect()).toBe('131:284');
  });

  it('reports the orientation the device is currently in', () => {
    stubScreen(852, 393);

    expect(probe().detect()).toBe('284:131');
  });

  it('has no answer when there is no screen to measure', () => {
    // A non-browser host. The panel hides the affordance rather than offering a
    // button that does nothing.
    stubScreen(undefined, undefined);

    expect(probe().detect()).toBeNull();
  });
});
