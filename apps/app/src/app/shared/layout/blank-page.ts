// Blank page — Epic 13
// Spec: PRD-UI-SHELL.md §4, §6

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { Fullscreen } from './fullscreen';

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
      <div class="page" [style.aspect-ratio]="aspectRatio()">
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
      overflow: auto;
    }

    /* Deliberately hard-coded, not tokenised: paper is paper in both themes.
       Piping UI tokens in here is the mistake this comment exists to prevent. */
    .page {
      background: #fff;
      box-shadow: var(--shadow-2);
      max-block-size: 100%;
      max-inline-size: 100%;
      block-size: 100%;
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

  /** A4 is the registry default for the Song-scope `aspectRatio` setting. */
  readonly aspectRatio = input('210 / 297');
}
