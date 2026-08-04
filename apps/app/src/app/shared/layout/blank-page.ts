// Blank page — Epic 13
// Spec: PRD-UI-SHELL.md §4, §6

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** A4 portrait, width ÷ height — the registry default for `aspectRatio`. */
const A4_RATIO = 210 / 297;

/**
 * The page-on-a-desk frame the render sits in.
 *
 * With no song selected this is what pane B shows: an **empty song — a blank
 * page**. Not an illustration, not a call to action; the shape of what goes
 * there (§4).
 *
 * The page does not follow the app theme by itself. The render is a *document* —
 * it prints, it downloads, it is what the Audience sees — so dark mode is the
 * desk, not the paper (§6). Its aspect ratio is a Song-scope setting; A4 is the
 * registry default.
 *
 * `isDark` is the one thing that turns the paper over, and it is a different
 * thing wearing a similar name: not the theme, but the person at this screen
 * saying *this room, right now* — possibly by having asked for the theme to
 * speak for them (`UiStore.isSongDarkFollowingTheme`). Every mount that draws a
 * song on screen passes it, from Stage to the editor's preview; the default is
 * off, so a caller who has no answer gets paper. See `UiStore.isSongDark`.
 */
@Component({
  selector: 'app-blank-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-performing]': 'isPerforming()',
    '[class.is-dark]': 'isDark()',
  },
  template: `
    <div class="desk">
      <div
        class="page"
        data-testid="song-page"
        [class.is-turned]="isTurned()"
        [style.--page-ratio]="ratio()"
        [style.transform]="transform()"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .desk {
      display: grid;
      place-items: center;
      block-size: 100%;
      padding: var(--space-4);
      background: var(--surface-sunken);
      /* One song, one page (CONTEXT.md): the page is scaled to fit, never
         scrolled. It also makes the desk a definite-size box, so the container
         units below measure the space available, not the content inside it. */
      overflow: hidden;
      container-type: size;
    }

    /* Deliberately hard-coded, not tokenised: paper is paper in both themes.
       Piping UI tokens in here is the mistake this comment exists to prevent. */
    .page {
      background: #fff;
      box-shadow: var(--shadow-2);
      aspect-ratio: var(--page-ratio);
      /* Contain-fit in BOTH axes. This was block-size:100%, which let a tall
         song's width fill the desk while its height overflowed off the bottom —
         the grid row grew to the SVG's intrinsic height, so "100%" was huge.
         This takes the width that fits by height (100cqb times the ratio) or the
         full width, whichever is SMALLER; the aspect ratio then sets the height.
         A portrait page fits by height, a landscape one by width, neither spills. */
      inline-size: min(100cqi, 100cqb * var(--page-ratio));
      /* Zoom, when there is any, is a transform on this box and nothing else —
         the desk above is already overflow:hidden, so it is the window the
         magnified page moves behind. Deliberately no will-change:transform —
         that invites a cached raster layer, and a blurry magnified chord is the
         one thing this feature exists to prevent. Re-rasterising the SVG at the
         new scale is the cost of it staying a vector. */
      transform-origin: center;
    }

    /* Turned a quarter (ADR-0013): the same fit against the same desk, measured
       the other way round — which is the hole this page will actually occupy
       once rotate(-90deg) has been applied to it.

       So the pre-rotation box here is deliberately WIDER than the desk, and only
       the rotation brings it back on screen. That is why this class and the
       rotation in transform() must come from the one flag and never be applied
       apart: either one alone is a page hanging off both edges. */
    .page.is-turned {
      inline-size: min(100cqb, 100cqi * var(--page-ratio));
    }

    /* Performing: the song is what you are here for, so give it every pixel.
       The desk framing exists to say "this is a document you are editing" — mid-
       song that framing is just a smaller song. The aspect ratio still rules, so
       the page grows until one axis runs out; the leftover is bare desk. */
    :host(.is-performing) .desk {
      padding: 0;
      background: var(--surface);
    }

    :host(.is-performing) .page {
      box-shadow: none;
    }

    /* The dark page. Hard-coded #000 for the same reason the white above is
       hard-coded — this is paper, not chrome — and true black specifically: an
       OLED panel switches those pixels off, which is the whole point of the
       feature on a stage.

       The desk goes with it. The song's own SVG paints its ground (see
       RenderPlan.paper), so the page under it is really only there to catch the
       sub-pixel seam at the edges — but the desk is the leftover the aspect
       ratio could not fill, and a lit frame around a dark song is exactly the
       glare a performer turned this on to escape. */
    :host(.is-dark) .desk,
    :host(.is-dark) .page {
      background: #000;
    }

    /* Black paper on a black desk is one black rectangle: the page's edge — and
       therefore how much of the sheet the song is actually using — disappears.
       So the drop shadow inverts along with the paper. A hairline rim to state
       where the sheet ends, and a soft halo under it to keep it sitting ON the
       desk rather than being cut out of it.

       Kept faint on purpose (and faint in absolute terms, not merely relative):
       this is read in the dark, where the eye is wide open, and a bright frame
       around the song would be the glare the dark page exists to remove. */
    :host(.is-dark) .page {
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 12%),
        0 1px 4px rgb(255 255 255 / 5%);
    }
  `,
})
export class BlankPage {
  /**
   * Drop the desk — no padding, no shadow, the page hard against the edges.
   *
   * **Not a fullscreen question.** This used to read `Fullscreen.isActive()`
   * itself, so the same performance looked like a document you were editing
   * until you pressed the fullscreen key, and the song lost a `--space-4` band
   * on every side for no reason a performer could name. What the framing
   * actually answers is *what kind of view is this* — Stage and Audience are
   * watching a song, everywhere else is preparing one — and that is the
   * caller's fact, not the browser's. So the two views that already pass
   * `isDark` pass this too, and they pass it always.
   */
  readonly isPerforming = input(false);

  /**
   * The page shape, as **width ÷ height** — the same number the render's box
   * already resolved, so the paper you look at is the paper it prints on. A
   * number, not a CSS string, because the contain-fit maths needs to multiply by
   * it (see `.page`).
   */
  readonly ratio = input(A4_RATIO);

  /**
   * Black paper, for a song being read in the dark.
   *
   * An input rather than a read of `UiStore`, still: this frame is a *frame*,
   * and the day something mounts it for a page that must stay white — a print
   * proof, a thumbnail in a dialog — the answer has to be the caller's to give.
   * Every current mount happens to pass the same signal.
   *
   * The caller must hand the same flag to the render, or the paper and the ink
   * would be arguing (see `RenderOpts.dark`).
   */
  readonly isDark = input(false);

  /**
   * Magnification, and where the magnified page has been dragged to (CSS px of
   * the page's centre away from the desk's centre).
   *
   * **Numbers in, transform out — this frame does not know what a gesture is.**
   * The arithmetic that produces them is `zoom.ts` and the fingers that drive it
   * are `PageZoom`; both of those sit on the *caller's* element, because zooming
   * is something you do to a song you are performing, not to a preview of one you
   * are editing. Everywhere else leaves these at their defaults and gets exactly
   * the frame it had before.
   */
  readonly zoom = input(1);
  readonly panX = input(0);
  readonly panY = input(0);

  /**
   * Draw this page a quarter turn round, for a reader holding the device
   * sideways (ADR-0013).
   *
   * **Whether** is never decided here. This frame is handed the answer the same
   * way it is handed `isDark`, because the question has two halves and only the
   * caller holds one of them: `gainsRoomTurned` can say the turn would help, but
   * only the Performance view knows whether this reader asked for it, and only a
   * print path knows it need not ask at all.
   */
  readonly isTurned = input(false);

  /**
   * No transform at all while fitted and upright, rather than an identity one: an
   * untouched page should not be given a containing block it never asked for.
   *
   * **The rotation goes outermost**, which is the load-bearing detail. Written the
   * other way round, `translate` would run in the rotated frame and every pan
   * coordinate in `zoom.ts` would silently change meaning; out here the page's
   * own frame is what moves, so pan, clamp and fit all stay in it and `zoom.ts`
   * needs to know nothing about any of this.
   */
  protected readonly transform = computed(() => {
    const parts: string[] = [];
    if (this.isTurned()) {
      parts.push('rotate(-90deg)');
    }
    if (this.zoom() !== 1 || this.panX() !== 0 || this.panY() !== 0) {
      parts.push(
        `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
      );
    }
    return parts.length > 0 ? parts.join(' ') : null;
  });
}
