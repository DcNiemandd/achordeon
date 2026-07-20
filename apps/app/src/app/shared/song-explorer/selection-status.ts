// Selection status — Epic 6 (correction)
// Spec: CONTEXT.md §Song explorer

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Button } from '../../primitives';

/**
 * "3 selected — Clear (3)": how many rows are picked, and the way to unpick
 * them.
 *
 * **One component, so the two lists that carry a selection say it the same way
 * and in the same place** — the action bar above the list, at the end of the row
 * (the Songs module's position). The songbook builder used to put its Clear in
 * the transfer column between the panes, which read as a fifth transfer button
 * and sat nowhere near the list it emptied.
 *
 * Text, never an X: the count belongs on the control that undoes it, and an
 * icon-only X beside a delete bin — or beside the bar's own "back" X — is a coin
 * flip.
 */
@Component({
  selector: 'app-selection-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    @if (count() > 0) {
      <span class="count" data-testid="selection-count">{{
        countLabel()
      }}</span>
      <button
        appButton
        type="button"
        variant="ghost"
        class="clear"
        [attr.aria-label]="clearLabel"
        data-testid="selection-clear"
        (click)="cleared.emit()"
      >
        {{ clearCountLabel() }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      min-inline-size: 0;
    }

    .count {
      font-size: var(--text-sm);
      color: var(--brand);
      white-space: nowrap;
    }

    .clear {
      padding-inline: var(--space-1);
      font-size: var(--text-xs);
      color: var(--brand);
      white-space: nowrap;
    }
  `,
})
export class SelectionStatus {
  readonly count = input.required<number>();
  readonly cleared = output<void>();

  protected readonly countLabel = computed(
    () => $localize`:@@explorer.selected:${this.count()}:count: selected`,
  );

  protected readonly clearCountLabel = computed(
    () => $localize`:@@explorer.clearCount:Clear (${this.count()}:count:)`,
  );

  protected readonly clearLabel = $localize`:@@explorer.clear:Clear the selection`;
}
