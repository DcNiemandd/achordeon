// Empty state — Epic 13
// Spec: PRD-UI-SHELL.md §2

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text">{{ text() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      block-size: 100%;
      padding: var(--space-5);
      color: var(--text-faint);
      text-align: center;
    }

    .text {
      margin: 0;
      font-size: var(--text-sm);
    }
  `,
})
export class EmptyState {
  readonly text = input('');
}
