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
   * A single finger (or click) that went down and came up in the same place, and
   * was not the second half of a double. The pages reveal the chrome with it.
   */
  readonly tapped = output<void>();

  private readonly state = signal<ZoomState>(FIT);

  readonly scale = computed(() => this.state().scale);
  readonly panX = computed(() => this.state().x);
  readonly panY = computed(() => this.state().y);
  readonly isZoomed = computed(() => isZoomed(this.state()));
  readonly percent = computed(() => zoomPercent(this.state()));

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
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
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
      this.state.set(
        panBy(
          this.state(),
          this.desk(box),
          point.x - this.previous.x,
          point.y - this.previous.y,
        ),
      );
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
        toggleZoom(this.state(), this.desk(box), focusOf(point, box)),
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
        focusOf({ x: event.clientX, y: event.clientY }, box),
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
        focusOf(midpoint, box),
      );
      if (this.midpoint !== null) {
        // Two fingers moving together drag the page as well as scaling it —
        // without this, a pinch that drifts feels nailed to the glass.
        next = panBy(
          next,
          desk,
          midpoint.x - this.midpoint.x,
          midpoint.y - this.midpoint.y,
        );
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
  }

  private desk(box?: DOMRect): Desk {
    const rect = box ?? this.host.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: this.ratio() };
  }
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A client point as an offset from the desk's centre — what `zoom.ts` wants. */
function focusOf(point: Point, box: DOMRect): Focus {
  return {
    x: point.x - box.left - box.width / 2,
    y: point.y - box.top - box.height / 2,
  };
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
