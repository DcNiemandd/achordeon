// Zoom pill — Stage & Audience ▸ page zoom
// Spec: docs/adr/0012-page-zoom-is-ours-not-the-browsers.md

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Icon } from '../../primitives';

/**
 * "You are zoomed in, and this is the way out."
 *
 * **Only on screen while it is true**, which is why it is a floating chip and not
 * a control in the bar. Both bars are already full — the performing bar carries
 * five actions, a centred prev/next and an exit; the phone's has four thumb
 * targets and an overflow — and a button that means nothing for the whole of a
 * normal set should not be holding a permanent slot in either.
 *
 * It also does the job no bar button could: while the page is magnified a swipe
 * pans instead of turning, and a performer whose swipe just stopped working needs
 * to be told why *by the screen*, not by remembering. So it survives the chrome
 * auto-hide — it is state, not chrome, and fullscreen hiding it would hide the
 * explanation exactly where it is needed most.
 */
@Component({
  selector: 'app-zoom-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      class="pill"
      [attr.aria-label]="resetLabel"
      data-testid="zoom-reset"
      (click)="cleared.emit()"
    >
      <app-icon name="zoomOut" />
      <span class="percent">{{ percent() }}%</span>
    </button>
  `,
  styles: `
    :host {
      position: absolute;
      inset-block-end: var(--space-3);
      inset-inline-start: var(--space-3);
      /* Under the summary panel, over the page. */
      z-index: 9;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-full, 999px);
      /* Its own surface, not the page's: the page under it may be white paper
         or true black, and the pill has to stay legible over either. */
      background: var(--surface-overlay);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      box-shadow: var(--shadow-2);
      cursor: pointer;
    }

    .pill:hover {
      background: var(--surface-hover);
    }

    .pill app-icon {
      --icon-size: 16px;
    }

    .percent {
      min-inline-size: 4ch;
      text-align: start;
    }
  `,
})
export class ZoomPill {
  /** The current magnification, whole percent. */
  readonly percent = input.required<number>();

  /** Back to the whole page. Not `reset`: that is a native DOM event name, and a
   * component output may not shadow one. */
  readonly cleared = output<void>();

  protected readonly resetLabel = $localize`:@@zoom.reset:Reset zoom`;
}
