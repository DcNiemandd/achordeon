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
    <div
      class="wrap"
      [class.glow]="isMarked()"
      [appTooltip]="isMarked() ? note() : ''"
      appTooltipTrigger="hover"
    >
      <ng-content />
    </div>
    <!-- Referenced by the wrapped control's aria-describedby, so the note is
         announced without replacing the control's own name. -->
    @if (isMarked()) {
      <span [id]="id" hidden>{{ note() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      position: relative;
    }

    /* The wrapper is a layout box either way — only the gold is conditional. */
    .wrap {
      display: inline-flex;
    }

    .glow {
      border-radius: var(--radius-md);
      box-shadow: var(--premium-glow);
    }
  `,
})
export class Premium {
  /** The wrapped control's own label, e.g. "Transpose". */
  readonly label = input('');
  /**
   * Whether to actually mark. `false` renders the wrapped control untouched — no
   * glow, no tooltip, no described-by note.
   *
   * It defaults to `true` so `<app-premium>` on its own still means "this is
   * Premium", and exists because *who* sees the marker is a tier question, not a
   * layout one: someone who already pays should not be sold their own feature. The
   * caller binds it from the tier gate rather than wrapping this in an `@if`,
   * which would duplicate the control's markup in both branches.
   */
  readonly isMarked = input(true);
  readonly id = `app-premium-${nextId++}`;

  /** Appended, not replaced — the control still says what it does. */
  protected readonly note = computed(() => {
    const suffix = $localize`:@@premium.note:Premium feature available for testing`;
    return this.label() ? `${this.label()} — ${suffix}` : suffix;
  });
}
