// Action bar — Epic 13
// Spec: PRD-UI-SHELL.md §4

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The module's title + actions, sitting **above pane A only — never spanning
 * pane B**. Nothing sits above the render but the render (§4).
 *
 * Rows **wrap, and group by meaning** (row 1 insert, row 2 transform) rather
 * than by whatever happened to overflow. No tabs: everything stays visible and
 * one click away, and vertical space is what pane A has most of. Overflow into
 * a `⋯` is a mobile concession, not the desktop default.
 *
 * **Not `ngToolbar`, despite this being a genuine command group** [corrected: it
 * shipped broken]. Aria's `Toolbar` owns its children through `ngToolbarWidget`,
 * and with none registered it marks itself `aria-disabled="true"` — which every
 * projected button then inherits. A screen reader announced all of them as
 * disabled, and Playwright refused to click them ("element is not enabled"). The
 * bar projects arbitrary feature content, so it cannot register widgets it has
 * never seen.
 *
 * Making it work would mean every feature remembering `ngToolbarWidget value="…"`
 * on every button, and forgetting it silently disables the bar. That is a bad
 * trade for roving tabindex on a handful of buttons that Tab already reaches. A
 * plain `role="toolbar"` keeps the grouping semantics honest without the trap.
 *
 * The feature projects its own actions: what a module can do is the module's
 * business, not the shell's.
 */
@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" data-testid="action-bar">
      @if (title()) {
        <div class="title-row">
          <h1 class="title" data-testid="module-title">{{ title() }}</h1>
          <ng-content select="[bar-end]" />
        </div>
      }

      <div
        role="toolbar"
        aria-orientation="horizontal"
        class="actions"
        [attr.aria-label]="actionsLabel()"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      border-block-end: 1px solid var(--border);
      background: var(--surface-raised);
    }

    .bar {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      min-block-size: 24px;
    }

    .title {
      margin: 0;
      font-size: var(--text-md);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Wrap to as many rows as the module needs. */
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1);
    }

    .actions:empty {
      display: none;
    }
  `,
})
export class ActionBar {
  readonly title = input('');
  readonly actionsLabel = input($localize`:@@actionBar.label:Actions`);
}
