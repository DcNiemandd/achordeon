// Dialog chrome — Epic 5
// Spec: PRD-UI-SHELL.md §2 (base components), §4 (the editor's settings dialog)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/**
 * A dialog: title bar, content, actions.
 *
 * **Hand-rolled, because Angular Aria v21 has no Dialog pattern** — it lands in
 * v22 (PRD-UI-SHELL.md §2). What Aria would have given us is the focus trap and
 * the semantics, and the CDK already has the first.
 *
 * **Rendered inline, not through the CDK Overlay**, and that is what buys the two
 * homes this needs to have:
 *
 * - `mode="viewport"` — a modal, centered on the window, over a scrim. What a
 *   destructive confirmation wants: it is the only thing that matters until it is
 *   answered.
 * - `mode="container"` — centered on the nearest positioned ancestor, no scrim.
 *   The song editor's render settings open **centered on pane A with pane B fully
 *   visible**, because you tune the render while watching it (§4). An Overlay
 *   renders into a viewport-level container and cannot be positioned on a pane
 *   without measuring it.
 *
 * `aria-modal` follows the scrim rather than being hard-coded: it tells a screen
 * reader the rest of the page is inert, which is true of the confirmation and a
 * lie about the settings dialog — where the render behind it is exactly what the
 * user is there to look at.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus, Button, Icon],
  host: {
    '[class]': '"mode-" + mode()',
    // Esc closes from anywhere inside, including the scrim.
    '(keydown.escape)': 'closed.emit()',
  },
  template: `
    @if (isModal()) {
      <!-- The scrim is a pointer convenience, not a control: it is aria-hidden,
           and every keyboard path it could offer already exists as Esc and the
           close button. Giving it a role and a tabstop would announce "button"
           for a rectangle of dimmed nothing.
        eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div
        class="scrim"
        aria-hidden="true"
        data-testid="dialog-scrim"
        (click)="closed.emit()"
      ></div>
    }

    <div
      class="panel"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      role="dialog"
      [attr.aria-modal]="isModal()"
      [attr.aria-label]="title()"
      data-testid="dialog"
    >
      <header class="head">
        <h2 class="title">{{ title() }}</h2>
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [attr.aria-label]="closeLabel"
          data-testid="dialog-close"
          (click)="closed.emit()"
        >
          <app-icon name="close" />
        </button>
      </header>

      <div class="body">
        <ng-content />
      </div>

      <footer class="foot">
        <ng-content select="[dialog-actions]" />
      </footer>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: grid;
      place-items: center;
      /* The host covers its area only so it can centre the panel; without this
         it would swallow every click on the pane behind an unscrimmed dialog. */
      pointer-events: none;
    }

    :host(.mode-viewport) {
      position: fixed;
    }

    .scrim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.4);
      pointer-events: auto;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      /* A set size, not merely a maximum: the panel is a centred flex item, so a
         max alone left it shrink-wrapped around its content — the settings
         dialog came out ~190px wide however high the maximum was, with its
         labels wrapping and the padding field clipping "0.5" to "0.". Setting
         the size makes 520 the width it actually takes, still clamped to the
         container so a narrow pane A gets a narrow dialog rather than a clipped
         one. Coupled to MIN_A_PX in split-pane.ts — move one, check the other. */
      inline-size: min(520px, calc(100% - var(--space-4)));
      max-block-size: calc(100% - var(--space-4));
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-overlay);
      box-shadow: var(--shadow-2);
      pointer-events: auto;
      overflow: auto;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .title {
      margin: 0;
      font-size: var(--text-md);
      font-weight: 500;
    }

    .body {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .foot {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    .foot:empty {
      display: none;
    }
  `,
})
export class Dialog {
  readonly title = input.required<string>();
  readonly mode = input<'viewport' | 'container'>('viewport');

  /** Esc, the close button, or the scrim. The caller decides what that means —
   * a dialog does not get to unmount itself. */
  readonly closed = output<void>();

  protected readonly isModal = computed(() => this.mode() === 'viewport');
  protected readonly closeLabel = $localize`:@@dialog.close:Close`;
}
