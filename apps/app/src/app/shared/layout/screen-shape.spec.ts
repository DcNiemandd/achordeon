// Screen shape — the device's own aspect ratio

import { TestBed } from '@angular/core/testing';
import { ScreenShape } from './screen-shape';

describe('ScreenShape', () => {
  const real = { width: window.screen.width, height: window.screen.height };

  function define(target: object, property: string, value: unknown): void {
    Object.defineProperty(target, property, { value, configurable: true });
  }

  /**
   * Pose as a device. `orientation` is what the *platform* says it is, which is
   * the whole point: `width`/`height` alone cannot be trusted to be in that
   * order (iOS never reorders them).
   */
  function poseAs(options: {
    width: unknown;
    height: unknown;
    orientation?: string;
    legacyAngle?: number;
  }): void {
    define(window.screen, 'width', options.width);
    define(window.screen, 'height', options.height);
    define(
      window.screen,
      'orientation',
      options.orientation === undefined
        ? undefined
        : { type: options.orientation },
    );
    define(window, 'orientation', options.legacyAngle);
  }

  afterEach(() => {
    poseAs({ width: real.width, height: real.height });
  });

  function probe(): ScreenShape {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ScreenShape);
  }

  it('reports the screen as a reduced ratio', () => {
    poseAs({ width: 393, height: 852, orientation: 'portrait-primary' });

    expect(probe().detect()).toBe('131:284');
  });

  it('reports a device already holding itself sideways as it is', () => {
    // Android: the dimensions swap with the device, so nothing needs correcting.
    poseAs({ width: 852, height: 393, orientation: 'landscape-primary' });

    expect(probe().detect()).toBe('284:131');
  });

  it('turns an iOS screen that refused to turn with the device', () => {
    // Safari on iOS reports the panel's physical dimensions and leaves them in
    // portrait order however the phone is held. Without this, the one promise the
    // button makes — the orientation you are holding it in — did not hold on an
    // iPhone.
    poseAs({ width: 393, height: 852, orientation: 'landscape-primary' });

    expect(probe().detect()).toBe('284:131');
  });

  it('takes the angle from an iOS too old for screen.orientation', () => {
    poseAs({ width: 393, height: 852, legacyAngle: -90 });

    expect(probe().detect()).toBe('284:131');
  });

  it('leaves the reading alone when nothing will name the orientation', () => {
    poseAs({ width: 393, height: 852 });

    expect(probe().detect()).toBe('131:284');
  });

  it('reports the other orientation when asked for sideways', () => {
    // What "Match this screen, sideways" writes: the shape this device would
    // have if it were held the other way round. It saves the reader turning the
    // phone first — which on a rotation-locked device would change nothing we
    // could see anyway.
    poseAs({ width: 393, height: 852, orientation: 'portrait-primary' });

    expect(probe().detect(true)).toBe('284:131');
  });

  it('reads sideways against the orientation actually held, not the box', () => {
    // The iOS correction and the sideways request compose into ONE swap, not two
    // that cancel: a phone already held sideways, whose panel still measures
    // portrait, asks for sideways and gets the upright shape back.
    poseAs({ width: 393, height: 852, orientation: 'landscape-primary' });

    expect(probe().detect(true)).toBe('131:284');
  });

  it('is its own inverse, whatever the platform reported', () => {
    poseAs({ width: 852, height: 393, orientation: 'landscape-primary' });

    expect(probe().detect(true)).toBe('131:284');
    expect(probe().detect(false)).toBe('284:131');
  });

  it('has no answer when there is no screen to measure', () => {
    // A non-browser host. The panel hides the affordance rather than offering a
    // button that does nothing.
    poseAs({ width: undefined, height: undefined });

    expect(probe().detect()).toBeNull();
  });
});
