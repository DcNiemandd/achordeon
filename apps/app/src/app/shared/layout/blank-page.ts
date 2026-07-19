// Blank page — Epic 13
// Spec: PRD-UI-SHELL.md §4, §6

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { Fullscreen } from './fullscreen';

/** A4 portrait, width ÷ height — the registry default for `aspectRatio`. */
const A4_RATIO = 210 / 297;

/**
 * The page-on-a-desk frame the render sits in.
 *
 * With no song selected this is what pane B shows: an **empty song — a blank
 * page**. Not an illustration, not a call to action; the shape of what goes
 * there (§4).
 *
 * The page is **always light**, in either theme. The render is a *document* — it
 * prints, it downloads, it is what the Audience sees — so dark mode is the desk,
 * not the paper (§6). Its aspect ratio is a Song-scope setting; A4 is the
 * registry default.
 */
@Component({
  selector: 'app-blank-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-performing]': 'fullscreen.isActive()' },
  template: `
    <div class="desk">
      <div class="page" [style.--page-ratio]="ratio()">
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
    }

    /* Performing: the song is the only thing on screen, so give it every pixel.
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
  `,
})
export class BlankPage {
  protected readonly fullscreen = inject(Fullscreen);

  /**
   * The page shape, as **width ÷ height** — the same number the render's box
   * already resolved, so the paper you look at is the paper it prints on. A
   * number, not a CSS string, because the contain-fit maths needs to multiply by
   * it (see `.page`).
   */
  readonly ratio = input(A4_RATIO);
}
