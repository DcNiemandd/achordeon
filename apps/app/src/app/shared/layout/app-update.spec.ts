// AppUpdate — Epic 11 ▸ update strategy
// Spec: PRD-INFRASTRUCTURE.md §11 (D5), ADR-0007

import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdate } from './app-update';

/**
 * A `SwUpdate` we can drive. Only the three members `AppUpdate` touches — and the
 * `unrecoverable` stream, which is the one place RxJS is unavoidable because the
 * real API offers nothing else.
 */
class FakeSwUpdate {
  isEnabled = true;
  found = false;
  activated = 0;
  checks = 0;
  readonly unrecoverable = new Subject<{ reason: string }>();
  readonly versionUpdates = new Subject<unknown>();

  checkForUpdate(): Promise<boolean> {
    this.checks++;
    return Promise.resolve(this.found);
  }

  activateUpdate(): Promise<boolean> {
    this.activated++;
    return Promise.resolve(true);
  }
}

describe('AppUpdate', () => {
  let sw: FakeSwUpdate;
  let update: AppUpdate;
  let reload: jest.Mock;

  /** `location.reload` is not callable in jsdom, and activate() ends in one. */
  beforeAll(() => {
    reload = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  beforeEach(() => {
    sw = new FakeSwUpdate();
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: sw }],
    });
    update = TestBed.inject(AppUpdate);
    reload.mockClear();
  });

  it('says nothing until there is something to say', () => {
    expect(update.prompt()).toBeNull();
  });

  it('offers the routine update, dismissibly', async () => {
    sw.found = true;
    await update.check();

    expect(update.prompt()).toBe('available');
    expect(update.isDismissible()).toBe(true);

    update.dismiss();
    expect(update.prompt()).toBeNull();
  });

  it('never reloads on its own — activation is the user pressing the button', async () => {
    sw.found = true;
    await update.check();

    expect(reload).not.toHaveBeenCalled();

    await update.activate();
    expect(sw.activated).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('takes no for an answer on the routine path, and none on the required one', () => {
    update.requireUpdate();

    expect(update.prompt()).toBe('required');
    expect(update.isDismissible()).toBe(false);

    // `dismiss` is the routine path's word; it must not clear a required update.
    update.dismiss();
    expect(update.prompt()).toBe('required');
  });

  it('goes looking for the new version the moment one is required (ADR-0007)', () => {
    const before = sw.checks;
    update.requireUpdate();

    // Telling the user to update is only fair if we have gone to fetch it.
    expect(sw.checks).toBe(before + 1);
  });

  it('is idempotent — every refusing ingest path may call it', () => {
    update.requireUpdate();
    const checks = sw.checks;
    update.requireUpdate();

    expect(sw.checks).toBe(checks);
  });

  it('puts an unrecoverable worker above everything else', async () => {
    sw.found = true;
    await update.check();
    update.requireUpdate();
    sw.unrecoverable.next({ reason: 'cache' });

    // Worst first: a cache that cannot serve the app is a bigger problem than a
    // version that cannot read its data.
    expect(update.prompt()).toBe('broken');
  });

  it('still reloads when activation fails — a fresh load re-registers the worker', async () => {
    jest
      .spyOn(sw, 'activateUpdate')
      .mockRejectedValue(new Error('no waiting worker'));

    await update.activate();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe('without a service worker', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      sw = new FakeSwUpdate();
      sw.isEnabled = false;
      TestBed.configureTestingModule({
        providers: [{ provide: SwUpdate, useValue: sw }],
      });
      update = TestBed.inject(AppUpdate);
      reload.mockClear();
    });

    it('checks nothing', async () => {
      sw.found = true;
      await update.check();

      expect(sw.checks).toBe(0);
      expect(update.prompt()).toBeNull();
    });

    it('degrades the forced path to a plain reload', async () => {
      update.requireUpdate();
      expect(update.prompt()).toBe('required');

      await update.activate();
      expect(sw.activated).toBe(0);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
