// Warn-before-leaving — Epic 10 / Epic 12 follow-up
// Spec: ADR-0004 (the "unsynced" warning is load-bearing).

import { DOCUMENT, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WarnUnsynced } from './warn-unsynced';

type Handler = (event: BeforeUnloadEvent) => void;

function setup() {
  const handlers: Handler[] = [];
  const reload = jest.fn();
  const view = {
    addEventListener: (type: string, handler: Handler) => {
      if (type === 'beforeunload') handlers.push(handler);
    },
    location: { reload },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }],
  });
  const service = TestBed.inject(WarnUnsynced);

  /** `connect` creates an effect, so it needs the injection context the shell's
   * constructor gives it for free. */
  const connect = (hasUnsynced: () => boolean): void => {
    TestBed.runInInjectionContext(() => service.connect(hasUnsynced));
    TestBed.tick();
  };

  /** Fire a `beforeunload` and report whether it was warned about. */
  const unload = (): boolean => {
    const event = { preventDefault: jest.fn(), returnValue: undefined };
    for (const handler of handlers) handler(event as never);
    return event.preventDefault.mock.calls.length > 0;
  };
  return { service, connect, unload, reload };
}

describe('WarnUnsynced', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('warns only while there is work the cloud has not seen', () => {
    const unsynced = signal(false);
    const { unload, connect } = setup();
    connect(() => unsynced());
    expect(unload()).toBe(false);

    unsynced.set(true);
    TestBed.tick();
    expect(unload()).toBe(true);
  });

  // The reported bug: switching language reloads the app, and the user was asked
  // whether they meant to leave a page they never chose to leave.
  it('says nothing about an unload the app itself started', () => {
    const { service, connect, unload, reload } = setup();
    connect(() => true);

    service.reload();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(unload()).toBe(false);
  });

  it('re-arms when the expected unload never comes', () => {
    const { service, connect, unload } = setup();
    connect(() => true);

    // A sign-in that threw before it could redirect. One failed click must not
    // disarm the warning for the rest of the session.
    service.expectUnload();
    expect(unload()).toBe(false);

    jest.advanceTimersByTime(5000);
    expect(unload()).toBe(true);
  });
});
