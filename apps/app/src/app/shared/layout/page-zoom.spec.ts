// Page zoom — the gestures, under a turned page
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md
//
// The zoom arithmetic itself is `zoom.spec.ts` and is deliberately untouched by
// the turn. What is tested here is the boundary: that the two halves of the
// question meet in the directive, and that the answer follows the desk.

import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageZoom } from './page-zoom';

/** A portrait desk, and a song written to fill one held sideways. */
const PORTRAIT_DESK = { width: 400, height: 900 };
const LANDSCAPE_DESK = { width: 900, height: 400 };
const LANDSCAPE = 284 / 131;
const PORTRAIT = 131 / 284;

@Component({
  imports: [PageZoom],
  template: `
    <div
      class="render"
      appPageZoom
      [ratio]="ratio()"
      [isTurnArmed]="isTurnArmed()"
    ></div>
  `,
})
class Host {
  readonly ratio = signal(LANDSCAPE);
  readonly isTurnArmed = signal(false);
  readonly zoom = viewChild.required(PageZoom);
}

describe('PageZoom — the turn', () => {
  /** Every observer built while a test runs, so a test can re-fire them. */
  let observers: (() => void)[];
  const realObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    observers = [];
    // A device that can be turned. `Viewport.isScreenTurnable` asks
    // `(pointer: coarse)`, and jsdom answers no to everything — which would make
    // every test below assert the desktop case by accident.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    // jsdom has no ResizeObserver, and the desk measurement rides on it. A stub
    // that fires once on observe() is what a browser does anyway — the first
    // observation arrives with the element, before any gesture.
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: () => void) {}
      observe(): void {
        observers.push(this.callback);
        this.callback();
      }
      unobserve(): void {
        observers = observers.filter((fire) => fire !== this.callback);
      }
      disconnect(): void {
        this.unobserve();
      }
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = realObserver;
  });

  function mount(desk = PORTRAIT_DESK): {
    host: Host;
    fixture: ComponentFixture<Host>;
    resize: (to: { width: number; height: number }) => void;
  } {
    const fixture = TestBed.createComponent(Host);
    const element = fixture.nativeElement.querySelector(
      '.render',
    ) as HTMLElement;
    // jsdom lays nothing out, so the desk is posed on the one call the directive
    // makes for it — the same call the real element serves.
    let box = desk;
    element.getBoundingClientRect = () =>
      ({ ...box, x: 0, y: 0, top: 0, left: 0 }) as DOMRect;
    // The observer was created and fired during construction, above the rect
    // stub, so the first reading was of a zero-sized jsdom element. Fire it
    // again now the element has a shape — which is what a browser does the
    // moment layout settles.
    for (const fire of observers) fire();
    fixture.detectChanges();
    return {
      host: fixture.componentInstance,
      fixture,
      resize: (to) => {
        box = to;
        for (const fire of observers) fire();
        fixture.detectChanges();
      },
    };
  }

  it('says a turn is worthwhile for a landscape song in a portrait desk', () => {
    expect(mount().host.zoom().isTurnWorthwhile()).toBe(true);
  });

  it('says it is not for a portrait song in the same desk', () => {
    const { host, fixture } = mount();
    host.ratio.set(PORTRAIT);
    fixture.detectChanges();

    expect(host.zoom().isTurnWorthwhile()).toBe(false);
  });

  // Armed is only half the question. The other half is whether it would help —
  // which is what stops the flag lying when the setlist reaches a portrait song.
  it('turns nothing until the reader has armed it', () => {
    const { host, fixture } = mount();
    expect(host.zoom().isTurned()).toBe(false);

    host.isTurnArmed.set(true);
    fixture.detectChanges();

    expect(host.zoom().isTurned()).toBe(true);
  });

  it('leaves a portrait song upright however armed the reader is', () => {
    const { host, fixture } = mount();
    host.isTurnArmed.set(true);
    host.ratio.set(PORTRAIT);
    fixture.detectChanges();

    expect(host.zoom().isTurned()).toBe(false);
    expect(host.zoom().isTurnWorthwhile()).toBe(false);
  });

  it('offers nothing on a landscape desk holding a landscape song', () => {
    const { host } = mount(LANDSCAPE_DESK);

    expect(host.zoom().isTurnWorthwhile()).toBe(false);
  });

  // The gate that is about the DEVICE and not the layout: a monitor cannot be
  // turned, so the offer never appears however well-shaped the gain would be.
  // Deliberately not a breakpoint — a tablet held sideways is wide AND turnable,
  // and that is the case the whole feature exists for.
  it('offers nothing at all on a screen that cannot be turned', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    const { host, fixture } = mount();
    host.isTurnArmed.set(true);
    fixture.detectChanges();

    expect(host.zoom().isTurnWorthwhile()).toBe(false);
    expect(host.zoom().isTurned()).toBe(false);
  });

  // Derived, not stored: the arming survives, and the turn stops applying the
  // moment it stops being worth anything.
  it('drops the turn when the desk itself comes round', () => {
    const { host, resize, fixture } = mount();
    host.isTurnArmed.set(true);
    fixture.detectChanges();
    expect(host.zoom().isTurned()).toBe(true);

    resize(LANDSCAPE_DESK);

    expect(host.zoom().isTurned()).toBe(false);
    expect(host.zoom().isTurnWorthwhile()).toBe(false);
  });
});
