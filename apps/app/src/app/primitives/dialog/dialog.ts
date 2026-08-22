// Dialog chrome — Epic 5
// Spec: PRD-UI-SHELL.md §2 (base components), §4 (the editor's settings dialog)

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';
import { DialogStack } from './dialog-stack';

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
    '[class]': '"mode-" + mode() + " size-" + size()',
    // Esc closes from anywhere inside, including the scrim.
    '(keydown.escape)': 'onEscape($event)',
    // What a modal's scrim does for a modal, for a dialog that has none — see
    // `onDocumentClick`.
    '(document:click)': 'onDocumentClick($event)',
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

    <!-- The panel holds focus itself [trap]. Clicking a heading, the padding,
         or dragging across a line of text lands on something unfocusable, and
         the browser then puts focus on the nearest focusable ancestor — of
         which there was none, so it went to the document body. Escape is bound
         on this component's host, which the body is not inside, so the key went
         nowhere and the dialog would not close until something in it was tabbed
         to. The focus trap only *captures* on open; it does not take focus back
         afterwards. -->
    <div
      #panel
      class="panel"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      tabindex="-1"
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
      /* The panel clips; the body inside it scrolls. Scrolling the PANEL took
         the title bar and the actions down with the content — on a dialog tall
         enough to need it (the shortcuts sheet, any dialog on a short viewport)
         you lost the close button as soon as you moved. */
      overflow: hidden;
    }

    /* A panel shaped like the page it frames — for content that IS the point
       rather than a form beside it (the song-render preview). Its height comes
       from the viewport and its width is the A4-portrait fraction of that height,
       so the whole dialog reads as a sheet standing up, not a wide box with a page
       floating in the middle of it. Both axes are clamped to the viewport, so a
       phone gets a near-full dialog and only a desktop sees the full sheet. The
       body flexes to fill what the header and footer leave. */
    :host(.size-large) .panel {
      block-size: min(88vh, 960px);
      inline-size: min(
        calc(88vh * 210 / 297),
        calc(960px * 210 / 297),
        calc(100% - var(--space-4))
      );
    }

    .head {
      flex: none;
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

    /* The only scroller. min-block-size: 0 because a flex item's floor is its
       own content — without it the body grows and the clip above eats the
       overflow instead of scrolling it. One rule covers both sizes: at "default"
       the panel is auto-height (capped by max-block-size), so there is no free
       space to grow into and the basis stands; at "large" the panel's height is
       set, and the body takes what the header and footer leave. */
    .body {
      flex: 1 1 auto;
      min-block-size: 0;
      overflow: auto;
      scrollbar-gutter: stable;
      font-size: var(--text-sm);
      color: var(--text);
    }

    .foot {
      flex: none;
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
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  constructor() {
    // Say that something is open, for as long as this is. Two things read it:
    // the keyboard layer, which has to know that the screen behind a dialog is
    // not to be acted on, and the nav, which closes what is open when it is
    // reached for — see `DialogStack`.
    inject(DestroyRef).onDestroy(
      inject(DialogStack).claim(() => this.closed.emit()),
    );
  }

  readonly title = input.required<string>();
  readonly mode = input<'viewport' | 'container'>('viewport');
  /** `default` is a form's width (520px); `large` is for content that is the
   * point rather than a sidebar to it — the song preview's render. */
  readonly size = input<'default' | 'large'>('default');

  /** Esc, the close button, or the scrim. The caller decides what that means —
   * a dialog does not get to unmount itself. */
  readonly closed = output<void>();

  protected readonly isModal = computed(() => this.mode() === 'viewport');
  protected readonly closeLabel = $localize`:@@dialog.close:Close`;

  /**
   * Close, and **stop the key there** [trap].
   *
   * Screens that open a dialog also bind Escape on `document` to mean "leave
   * this screen", and a keypress from inside the dialog bubbles all the way up
   * to it. Both handlers then ran on one press: this one closed the dialog, and
   * the screen's — finding the dialog already shut — walked out of the screen as
   * well. Pressing Escape over the songbook's settings threw you back to the
   * list.
   *
   * A guard on the other side cannot fix it, because by the time the outer
   * handler runs the dialog is gone and there is nothing left to see. The
   * element that consumed the key is the one that has to say so.
   */
  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.closed.emit();
  }

  /**
   * A click on the container, outside the panel — **the unscrimmed dialog's
   * click-away.**
   *
   * A modal has a scrim, and the scrim is both the dim and the target: clicking
   * beside the panel closes it. `mode="container"` has neither, deliberately —
   * the pane beside it is the whole point and must stay lit and alive — so the
   * same gesture had nowhere to land, and the dialog sat there until it was
   * dismissed by name.
   *
   * The rule is drawn at the **container**, not at the panel: a click anywhere
   * on the pane the dialog is centred on closes it, and a click on the *other*
   * pane does not. That is the distinction the mode exists for. The song
   * editor's render settings and the songbook's print settings both hang over
   * pane A while pane B shows what they are changing; clicking back into pane A
   * says "done here", and clicking the preview says "let me look".
   *
   * Bubble phase, not capture, so a click that also *does* something does that
   * thing first — the action bar's own settings toggle closes this dialog by its
   * own hand, and if this ran first the toggle would find it shut and re-open
   * it. `closed` twice is harmless; a dialog that will not close is not.
   */
  protected onDocumentClick(event: Event): void {
    if (this.isModal()) return;
    const target = event.target as Node | null;
    if (!target || this.panel().nativeElement.contains(target)) return;
    // The host is `inset: 0` over the container and lets pointers through, so
    // the container is the parent it was placed in — the pane.
    const container = this.host.nativeElement.parentElement;
    if (container?.contains(target)) this.closed.emit();
  }
}
