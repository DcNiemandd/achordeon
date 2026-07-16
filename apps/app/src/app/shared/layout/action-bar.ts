// Action bar — Epic 13
// Spec: PRD-UI-SHELL.md §4

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Toolbar } from '@angular/aria/toolbar';

/**
 * The module's title + actions, sitting **above pane A only — never spanning
 * pane B**. Nothing sits above the render but the render (§4).
 *
 * Rows **wrap, and group by meaning** (row 1 insert, row 2 transform) rather
 * than by whatever happened to overflow. No tabs: everything stays visible and
 * one click away, and vertical space is what pane A has most of. Overflow into
 * a `⋯` is a mobile concession, not the desktop default.
 *
 * `ngToolbar` is the right Aria pattern here — unlike the rail, this really is a
 * group of application commands, so roving tabindex is what a screen-reader user
 * expects. (Aria's `wrap` is keyboard focus wrap-around; the *visual* wrapping is
 * the flex-wrap below.)
 *
 * The feature projects its own actions: what a module can do is the module's
 * business, not the shell's.
 */
@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toolbar],
  template: `
    <div class="bar" data-testid="action-bar">
      @if (title()) {
        <div class="title-row">
          <h1 class="title" data-testid="module-title">{{ title() }}</h1>
          <ng-content select="[bar-end]" />
        </div>
      }

      <div
        ngToolbar
        orientation="horizontal"
        [wrap]="true"
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
