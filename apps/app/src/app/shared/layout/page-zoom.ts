// Page zoom — the gestures
// Spec: docs/adr/0012-page-zoom-is-ours-not-the-browsers.md; CONTEXT.md §Zoom

import {
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CENTRE,
  type Desk,
  FIT,
  type Focus,
  type ZoomState,
  isZoomed,
  panBy,
  toggleZoom,
  zoomBy,
  zoomPercent,
} from './zoom';
import { type Delta, gainsRoomTurned, toPageDelta, turnedDesk } from './turn';

/** Travel under which a pointer that went down and came up again was a tap. */
const TAP_SLOP_PX = 12;
/** How long a second tap has to arrive to make a double. */
const DOUBLE_TAP_MS = 300;
/** And how near the first one it has to land. Generous: a thumb is wide. */
const DOUBLE_TAP_SLOP_PX = 30;
/** Magnification per 100px of wheel. */
const WHEEL_STEP = 1.15;
/** Magnification per press of `+` / `-`. */
const KEY_STEP = 1.25;
/** A wheel delta in lines / pages, in px. Only Firefox still sends these. */
const LINE_PX = 16;
const PAGE_PX = 400;
/** No single wheel event may do more than this much of a zoom. */
const MAX_WHEEL_PX = 300;

/**
 * Magnify the page and drag it about — a gallery, over a song.
 *
 * **Ours, not the browser's, and that is not a preference.** Browser *page* zoom
 * cannot touch this render at all: the desk is `container-type: size` and the
 * page is `min(100cqi, 100cqb × ratio)`, so ctrl+plus shrinks the layout viewport
 * by exactly the factor it enlarges each CSS pixel and the page re-fits to the
 * same physical size. The only browser zoom that magnifies a fit-to-container
 * layout is visual-viewport pinch — touch-only, and disabled by the Fullscreen
 * API, which is where a performer spends the whole set. So there was one cell of
 * the grid where the platform helped, and it was not one of the two that matter
 * (ADR-0012).
 *
 * Sits on the element that frames the page (`.render`), takes `touch-action:
 * none` and owns every gesture over it. The sums live in `zoom.ts`; this is the
 * translation layer — events in, `ZoomState` out.
 *
 * **What it does not own is the page turn.** Stage's swipe stays where it is and
 * asks `isZoomed()` before turning: a drag magnifies into a pan the moment there
 * is somewhere to pan to, which is the gallery rule and the one thing users
 * already know. `tapped` is what is left of a single finger after panning and
 * double-tapping have taken their share — the pages wire it to
 * `Fullscreen.reveal()`.
 */
@Directive({
  selector: '[appPageZoom]',
  exportAs: 'appPageZoom',
  host: {
    '[style.touch-action]': "isEnabled() ? 'none' : null",
    '[style.cursor]': 'cursor()',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerGone($event)',
    '(lostpointercapture)': 'onPointerGone($event)',
    '(wheel)': 'onWheel($event)',
    // Safari's own pinch, which predates `touch-action` and ignores it on older
    // iOS. Non-standard, absent everywhere else, and harmless to ask for.
    '(gesturestart)': 'onLegacyGesture($event)',
    '(gesturechange)': 'onLegacyGesture($event)',
  },
})
export class PageZoom {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The page's shape, width ÷ height — the same number `BlankPage` is given.
   * The page's size is derived from it rather than measured; see `Desk`.
   */
  readonly ratio = input.required<number>();

  /** Off where there is no page to magnify — Audience's PIN prompt, mainly. */
  readonly isEnabled = input(true);

  /**
   * Has the reader said they are willing to hold the device the other way round
   * (`UiStore.isPageTurnArmed`)?
   *
   * Armed is only half the question; the other half is whether a quarter turn
   * would gain this page anything, and that needs the desk — which is the box
   * this directive is already sitting on and already observing. So the two halves
   * meet here and `isTurned` below is the one answer everything else reads:
   * the frame, the gestures, and Stage's page-turn swipe.
   */
  readonly isTurnArmed = input(false);

  /**
   * A single finger (or click) that went down and came up in the same place, and
   * was not the second half of a double. The pages reveal the chrome with it.
   */
  readonly tapped = output<void>();

  private readonly state = signal<ZoomState>(FIT);

  /** The desk's shape as last measured, width ÷ height. Zero until the first
   * observation, which reads as "not measured" to `gainsRoomTurned`. */
  private readonly deskRatio = signal(0);

  /**
   * Is the page drawn a quarter turn round (ADR-0013)?
   *
   * The gestures do not change; the **frame** does. A turned page's rightward
   * runs up the screen, so every screen-space vector this directive collects —
   * pan deltas, the pinch's drift, the point a double-tap should zoom about — is
   * put through `toPageDelta` on the way in, and the desk is handed over
   * transposed. Everything downstream then reasons in the page's own frame,
   * which is the frame `zoom.ts` has always worked in and the reason it needed
   * no changes for this.
   *
   * Derived, so it answers itself again when the window is resized or the device
   * finally does rotate: the arming survives, and the turn quietly stops applying
   * the moment it stops being worth anything.
   */
  readonly isTurned = computed(
    () => this.isTurnArmed() && gainsRoomTurned(this.ratio(), this.deskRatio()),
  );

  /** Would turning gain this page room, whatever the reader has asked for? What
   * the bars show their toggle on — a control that cannot act is not offered. */
  readonly isTurnWorthwhile = computed(() =>
    gainsRoomTurned(this.ratio(), this.deskRatio()),
  );

  readonly scale = computed(() => this.state().scale);
  readonly panX = computed(() => this.state().x);
  readonly panY = computed(() => this.state().y);
  readonly isZoomed = computed(() => isZoomed(this.state()));
  readonly percent = computed(() => zoomPercent(this.state()));

  /** A pointer is down on a magnified page — so this drag is a pan. */
  private readonly _isPanning = signal(false);
  readonly isPanning = this._isPanning.asReadonly();

  /**
   * The one thing on screen that says a drag will pan rather than turn the page.
   *
   * Fitted, the render keeps the ordinary arrow: a drag there is a page turn,
   * and an open hand over it would promise something it does not do. Magnified,
   * it is `grab`, and `grabbing` from the moment the button goes down rather
   * than from the first pixel of movement — the press is the grab, and a cursor
   * that only changed once the page started moving would always be a frame late.
   */
  protected readonly cursor = computed(() => {
    if (!this.isEnabled() || !this.isZoomed()) return null;
    return this._isPanning() ? 'grabbing' : 'grab';
  });

  /** Live pointers, by id. Two or more of them is a pinch. */
  private readonly points = new Map<number, Point>();
  /** Where the one finger went down, or null once it cannot be a tap any more. */
  private origin: Point | null = null;
  /** The furthest that finger has been from its origin. */
  private travel = 0;
  /** Previous frame of whichever gesture is running. */
  private previous: Point | null = null;
  private spread = 0;
  private midpoint: Point | null = null;
  /** The last completed tap, waiting to see whether a second one follows. */
  private lastTap: (Point & { at: number }) | null = null;

  constructor() {
    // Turning the page over to something that is not a page (Audience dropping
    // back to its PIN prompt) leaves a magnified state that nothing can see to
    // undo, and it would still be there when the next lobby joins.
    effect(() => {
      if (!this.isEnabled()) this.reset();
    });

    // A rotation or a window drag changes the desk under a zoom that was clamped
    // to the old one, and the page would sit with bare desk beside it. Re-clamp
    // rather than reset: the performer did not ask to lose their place.
    //
    // It is also where the desk's own shape is learned, for `isTurned` — the
    // first observation arrives on `observe()`, so the answer is right before
    // anyone has touched the page.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        this.measureDesk();
        if (this.isZoomed())
          this.state.set(panBy(this.state(), this.desk(), 0, 0));
      });
      observer.observe(this.host.nativeElement);
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  /** Back to the whole page. The pill, the keys, and every song change. */
  reset(): void {
    this.state.set(FIT);
  }

  zoomIn(): void {
    this.state.set(zoomBy(this.state(), this.desk(), KEY_STEP, CENTRE));
  }

  zoomOut(): void {
    this.state.set(zoomBy(this.state(), this.desk(), 1 / KEY_STEP, CENTRE));
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.isEnabled()) return;
    const point = { x: event.clientX, y: event.clientY };
    this.points.set(event.pointerId, point);

    // Capture, so a pan that runs off the edge of the render keeps arriving and
    // the pointerup that ends it cannot be delivered somewhere else. Events still
    // bubble on to the page's own swipe handler from here.
    try {
      this.host.nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. Nothing to capture, nothing to fix.
    }

    if (this.points.size === 1) {
      this.origin = point;
      this.travel = 0;
      this.previous = point;
      this._isPanning.set(this.isZoomed());
      return;
    }
    // A second finger. Whatever this gesture is, it is not a tap any more — and
    // the anchor must not move out from under the first finger.
    this.origin = null;
    this.previous = null;
    this.anchorPinch();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.points.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    this.points.set(event.pointerId, point);
    const box = this.host.nativeElement.getBoundingClientRect();

    if (this.points.size >= 2) {
      this.pinch(box);
      event.preventDefault();
      return;
    }

    if (this.origin !== null) {
      this.travel = Math.max(this.travel, distance(point, this.origin));
    }
    if (this.isZoomed() && this.previous !== null) {
      const moved = this.inPageFrame(
        point.x - this.previous.x,
        point.y - this.previous.y,
      );
      this.state.set(panBy(this.state(), this.desk(box), moved.dx, moved.dy));
      event.preventDefault();
    }
    this.previous = point;
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.points.has(event.pointerId)) return;
    this.points.delete(event.pointerId);

    if (this.points.size > 0) {
      // A finger left a pinch. Re-anchor on what is still down, or the survivor
      // jumps the page by the whole distance between the two.
      this.anchorPinch();
      this.previous = this.points.values().next().value ?? null;
      return;
    }

    const wasTap = this.origin !== null && this.travel < TAP_SLOP_PX;
    this.forgetGesture();
    if (!wasTap) {
      this.lastTap = null;
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    const at = Date.now();
    const first = this.lastTap;
    if (
      first !== null &&
      at - first.at < DOUBLE_TAP_MS &&
      distance(point, first) < DOUBLE_TAP_SLOP_PX
    ) {
      this.lastTap = null;
      const box = this.host.nativeElement.getBoundingClientRect();
      this.state.set(
        toggleZoom(this.state(), this.desk(box), this.focusOf(point, box)),
      );
      return;
    }

    // A first tap reveals the chrome straight away rather than waiting out the
    // double-tap window: a 300ms lag on every tap is a worse deal than a bar
    // that appears a moment before the zoom lands, and the bar hides itself.
    this.lastTap = { ...point, at };
    this.tapped.emit();
  }

  protected onPointerGone(event: PointerEvent): void {
    if (!this.points.has(event.pointerId)) return;
    this.points.delete(event.pointerId);
    if (this.points.size === 0) {
      this.forgetGesture();
      return;
    }
    this.anchorPinch();
    this.previous = this.points.values().next().value ?? null;
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.isEnabled()) return;
    // Always prevented, ctrl held or not: the browser's answer to ctrl+wheel here
    // is page zoom, which this layout is immune to, so letting it through would
    // resize every bar in the app and leave the song exactly as it was.
    event.preventDefault();

    const box = this.host.nativeElement.getBoundingClientRect();
    const pixels = clampTo(wheelPixels(event), -MAX_WHEEL_PX, MAX_WHEEL_PX);
    this.state.set(
      zoomBy(
        this.state(),
        this.desk(box),
        Math.pow(WHEEL_STEP, -pixels / 100),
        this.focusOf({ x: event.clientX, y: event.clientY }, box),
      ),
    );
  }

  /** Safari's pinch, which would zoom the whole page over the top of ours. */
  protected onLegacyGesture(event: Event): void {
    if (this.isEnabled()) event.preventDefault();
  }

  /** One frame of a two-finger gesture: scale about the midpoint, and follow it. */
  private pinch(box: DOMRect): void {
    const [first, second] = [...this.points.values()];
    if (first === undefined || second === undefined) return;

    const spread = distance(first, second);
    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    const desk = this.desk(box);

    if (this.spread > 0) {
      let next = zoomBy(
        this.state(),
        desk,
        spread / this.spread,
        this.focusOf(midpoint, box),
      );
      if (this.midpoint !== null) {
        // Two fingers moving together drag the page as well as scaling it —
        // without this, a pinch that drifts feels nailed to the glass.
        const drift = this.inPageFrame(
          midpoint.x - this.midpoint.x,
          midpoint.y - this.midpoint.y,
        );
        next = panBy(next, desk, drift.dx, drift.dy);
      }
      this.state.set(next);
    }

    this.spread = spread;
    this.midpoint = midpoint;
  }

  /** Take the current two fingers as the pinch's new starting point. */
  private anchorPinch(): void {
    const [first, second] = [...this.points.values()];
    if (first === undefined || second === undefined) {
      this.spread = 0;
      this.midpoint = null;
      return;
    }
    this.spread = distance(first, second);
    this.midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  private forgetGesture(): void {
    this.origin = null;
    this.previous = null;
    this.spread = 0;
    this.midpoint = null;
    this.travel = 0;
    this._isPanning.set(false);
  }

  /** Note the desk's shape. Zero-sized boxes (a hidden route, a test host with
   * no layout) are left as they are — `gainsRoomTurned` refuses them anyway, and
   * writing a 0 would only churn a signal to the same answer. */
  private measureDesk(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.deskRatio.set(rect.width / rect.height);
    }
  }

  private desk(box?: DOMRect): Desk {
    const rect = box ?? this.host.nativeElement.getBoundingClientRect();
    const desk = {
      width: rect.width,
      height: rect.height,
      ratio: this.ratio(),
    };
    return this.isTurned() ? turnedDesk(desk) : desk;
  }

  /** A screen-space movement said in the page's frame — the identity while the
   * page is upright, which is every existing caller's behaviour unchanged. */
  private inPageFrame(dx: number, dy: number): Delta {
    return this.isTurned() ? toPageDelta(dx, dy) : { dx, dy };
  }

  /**
   * A client point as an offset from the desk's centre — what `zoom.ts` wants,
   * in the frame it wants it.
   *
   * The focus is a vector from the centre, so the turn moves it exactly as it
   * moves a pan. Left unmapped, a pinch or a double-tap would zoom about a point
   * a quarter turn away from the chord the reader actually put their finger on.
   */
  private focusOf(point: Point, box: DOMRect): Focus {
    const fromCentre = {
      x: point.x - box.left - box.width / 2,
      y: point.y - box.top - box.height / 2,
    };
    const { dx, dy } = this.inPageFrame(fromCentre.x, fromCentre.y);
    return { x: dx, y: dy };
  }
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A wheel delta in px, whatever unit the browser chose to send. */
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * LINE_PX;
  if (event.deltaMode === 2) return event.deltaY * PAGE_PX;
  return event.deltaY;
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
