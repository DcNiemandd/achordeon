// Premium highlight — Epic 13
// Spec: PRD-UI-SHELL.md §5.3; CONTEXT.md §Premium highlight

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { Tooltip } from '../tooltip/tooltip';

let nextId = 0;

/**
 * Marks a control that is (or will become) Premium-only.
 *
 * A **gold shadow plus a tooltip appended to the control's own label** — "Transpose
 * — Premium feature available for testing" — so the tooltip text is *composed*,
 * not static, and this wraps a control rather than sitting beside it.
 *
 * Accessibility: the wrapped control keeps its plain `aria-label` ("Transpose")
 * and the premium note rides `aria-describedby`. A screen reader then says
 * "Transpose, Premium feature available for testing" — no double-naming (§5.2),
 * and the premium status is not gold-shadow-only, which would reach nobody who
 * cannot see it.
 *
 * **Decoration over a working control, never a disabled one**: `tierGuard` is
 * highlight-and-tooltip during testing, not a hard block
 * (PRD-INFRASTRUCTURE.md §10).
 */
@Component({
  selector: 'app-premium',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tooltip],
  host: { '[attr.data-testid]': '"premium"' },
  template: `
    <div class="glow" [appTooltip]="note()" appTooltipTrigger="hover">
      <ng-content />
    </div>
    <!-- Referenced by the wrapped control's aria-describedby, so the note is
         announced without replacing the control's own name. -->
    <span [id]="id" hidden>{{ note() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      position: relative;
    }

    .glow {
      display: inline-flex;
      border-radius: var(--radius-md);
      box-shadow: var(--premium-glow);
    }
  `,
})
export class Premium {
  /** The wrapped control's own label, e.g. "Transpose". */
  readonly label = input('');
  readonly id = `app-premium-${nextId++}`;

  /** Appended, not replaced — the control still says what it does. */
  protected readonly note = computed(() => {
    const suffix = $localize`:@@premium.note:Premium feature available for testing`;
    return this.label() ? `${this.label()} — ${suffix}` : suffix;
  });
}
