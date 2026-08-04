// Performance transpose control — Epic 8 ▸ performing mode
// Spec: apps/docs/docs/stage-audience/index.mdx §Transpose

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Button, Icon, Tooltip } from '../../primitives';
import { formatSemitones } from './transpose';

/**
 * Down · offset · up, and nothing else — the whole of "play it somewhere else".
 *
 * **Controlled and stateless**, like `SettingsPanel`: the offset arrives as an
 * input and the two acts leave as outputs, so the same three buttons serve the
 * desktop bar (inline, in the open) and both phone sheets (behind ⋯) without
 * either of them owning where the number is kept. The performer's offset and a
 * viewer's are different numbers in different sessions; this is only how either
 * one is worn.
 *
 * **The number is the reset.** A stepper that can wrap needs a way home that is
 * not eleven more taps, and the value was already the thing being looked at.
 * Disabled at 0 rather than hidden — a control that vanished when it reached its
 * resting state would move the two arrows apart every time it did.
 */
@Component({
  selector: 'app-transpose-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Tooltip],
  template: `
    <div class="stepper" role="group" [attr.aria-label]="groupLabel">
      <button
        appButton
        type="button"
        variant="secondary"
        [isIconOnly]="true"
        [attr.aria-label]="downLabel"
        [appTooltip]="downLabel"
        data-testid="transpose-down"
        (click)="stepped.emit(-1)"
      >
        <app-icon name="transposeDown" />
      </button>

      <!-- aria-live, because on the phone this is the only thing that answers
           the tap: the sheet does not close and nothing else on screen says the
           song just moved. -->
      <button
        appButton
        type="button"
        class="value"
        [disabled]="value() === 0"
        [attr.aria-label]="resetLabel"
        [appTooltip]="resetLabel"
        data-testid="transpose-value"
        (click)="cleared.emit()"
      >
        <span aria-live="polite">{{ text() }}</span>
      </button>

      <button
        appButton
        type="button"
        variant="secondary"
        [isIconOnly]="true"
        [attr.aria-label]="upLabel"
        [appTooltip]="upLabel"
        data-testid="transpose-up"
        (click)="stepped.emit(1)"
      >
        <app-icon name="transposeUp" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    /* Wide enough for "-11" so the arrows do not shuffle sideways as the digits
       change, and lining figures so the number itself does not either. */
    .value {
      min-inline-size: 4ch;
      font-variant-numeric: tabular-nums;
    }

    /* At rest it is not an action, but it is still the readout — the disabled
       button's dimming would make the one number on the control the faintest
       thing on the bar. */
    .value:disabled {
      opacity: 1;
      color: var(--text-muted);
    }
  `,
})
export class TransposeStepper {
  /** The offset in semitones, signed. */
  readonly value = input.required<number>();

  /** One step, `-1` or `+1`. The wrap is the session's (`stepTranspose`). */
  readonly stepped = output<number>();
  /** Back to the written key. */
  readonly cleared = output<void>();

  protected readonly text = computed(() => formatSemitones(this.value()));

  /** The same id the sheets title themselves with — one word, said once. */
  protected readonly groupLabel = $localize`:@@transpose.title:Transpose`;
  protected readonly upLabel = $localize`:@@transpose.up:Transpose up`;
  protected readonly downLabel = $localize`:@@transpose.down:Transpose down`;
  protected readonly resetLabel = $localize`:@@transpose.reset:Back to the written key`;
}
