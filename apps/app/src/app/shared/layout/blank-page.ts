// Blank page — Epic 13
// Spec: PRD-UI-SHELL.md §4, §6

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
  `,
})
export class BlankPage {
  /** A4 is the registry default for the Song-scope `aspectRatio` setting. */
  readonly aspectRatio = input('210 / 297');
}
