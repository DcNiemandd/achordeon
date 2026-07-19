// Action bar — Epic 13
// Spec: PRD-UI-SHELL.md §4

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { Fullscreen } from './fullscreen';

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
  // "Everything hidden" means everything: the rail and the shell's bars are the
  // shell's to hide, but this bar is the feature's and would otherwise sit there
  // through a performance. It answers to the same signal.
  host: { '[hidden]': '!fullscreen.isChromeVisible()' },
  template: `
    <div class="bar" data-testid="action-bar">
      @if (title()) {
        <div class="title-row">
          @if (isTitleEditable()) {
            <!-- Still an <h1> to the accessibility tree: it is the page's
                 heading, and being editable does not change what it is. The
                 input carries the heading's own text, so nothing is announced
                 twice. -->
            <h1 class="title title-field" data-testid="module-title">
              <input
                #titleInput
                class="title-input"
                [value]="title()"
                [attr.aria-label]="titleLabel()"
                data-testid="module-title-input"
                (keydown.enter)="titleInput.blur()"
                (keydown.escape)="revert(titleInput)"
                (blur)="commitTitle(titleInput)"
              />
            </h1>
          } @else {
            <h1 class="title" data-testid="module-title">{{ title() }}</h1>
          }
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

    /* Required, and easy to miss: the UA sheet's [hidden] { display: none } is a
       lower-specificity rule than :host { display: block }, so binding [hidden]
       alone does nothing at all here. */
    :host([hidden]) {
      display: none;
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

    .title-field {
      flex: 1;
      min-inline-size: 0;
      overflow: visible;
    }

    /* Reads as the heading it is until you touch it, then as the field it also
       is. A permanently boxed input at the top of the page would claim to be the
       main thing to fill in, which it is not — the song is. */
    .title-input {
      inline-size: 100%;
      padding: 2px var(--space-1);
      margin-inline-start: calc(var(--space-1) * -1);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      color: inherit;
      font: inherit;
      text-overflow: ellipsis;
    }

    .title-input:hover {
      border-color: var(--border);
    }

    .title-input:focus {
      border-color: var(--brand);
      background: var(--surface);
      text-overflow: clip;
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
  protected readonly fullscreen = inject(Fullscreen);

  readonly title = input('');
  readonly actionsLabel = input($localize`:@@actionBar.label:Actions`);

  /**
   * Turn the heading into a rename field.
   *
   * The module title *is* the thing's name, so the place it is already written is
   * the obvious place to change it — rather than a dialog, or a trip back to a
   * list you cannot see from here.
   */
  readonly isTitleEditable = input(false);
  readonly titleLabel = input($localize`:@@actionBar.rename:Name`);
  readonly titleChange = output<string>();

  /**
   * Enter and blur commit; Esc reverts. The same contract as renaming in the song
   * list, because it is the same act — learning it twice would be the surprise.
   * A blank or unchanged name is dropped here as well as downstream: the field
   * has to snap back to something, and that something is the current name.
   */
  protected commitTitle(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (!name || name === this.title()) {
      field.value = this.title();
      return;
    }
    this.titleChange.emit(name);
  }

  protected revert(field: HTMLInputElement): void {
    field.value = this.title();
    field.blur();
  }
}
