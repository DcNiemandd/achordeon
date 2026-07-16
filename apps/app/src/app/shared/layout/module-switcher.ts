// Module switcher — Epic 13
// Spec: PRD-UI-SHELL.md §4 (mobile)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Icon } from '../../primitives';
import { ALL_NAV_ITEMS, NAV_ITEMS } from './nav-items';

/**
 * The mobile nav trigger: the active module's icon stacked on a hamburger rule,
 * **no text**, opening the destinations upward.
 *
 * The composite glyph does two jobs neither mark does alone — the `☰` keeps the
 * "this opens the nav" affordance a bare module icon would lose, and the module
 * icon carries the "you are here" state a bare `☰` never had (the rail's active
 * marker, which does not exist down here). It sits bottom-left because that is
 * thumb-reachable; a top-left hamburger is the worst target on a large phone.
 *
 * A `<nav>` of links, **not** an Aria menu: the WAI-ARIA APG is explicit that
 * `role="menu"` is for application commands, not site navigation.
 *
 * With the text gone and no hover tooltip on touch, the `aria-label` is the only
 * thing a screen reader gets — so it names the module *and* the action.
 */
@Component({
  selector: 'app-module-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Icon,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
  ],
  // On the document, not the popup: a <nav> is not focusable, so a keydown bound
  // to it would never fire. Esc must work from wherever focus landed inside.
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <button
      type="button"
      class="trigger"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      data-testid="module-switcher"
      [attr.aria-label]="triggerLabel()"
      [attr.aria-expanded]="isOpen()"
      aria-haspopup="true"
      (click)="isOpen.set(!isOpen())"
    >
      <app-icon class="module-glyph" [name]="activeItem().icon" />
      <app-icon class="hamburger-glyph" name="menu" />
    </button>

    <ng-template
      [cdkConnectedOverlay]="{ origin }"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="isOpen.set(false)"
      (detach)="isOpen.set(false)"
    >
      <nav
        class="popup"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        data-testid="module-nav"
        [attr.aria-label]="navLabel"
      >
        @for (item of allItems; track item.id) {
          <a
            class="link"
            [routerLink]="item.route"
            [attr.data-testid]="'nav-' + item.id"
            [class.is-active]="item.id === activeItem().id"
            [attr.aria-current]="item.id === activeItem().id ? 'page' : null"
            (click)="isOpen.set(false)"
          >
            <app-icon [name]="item.icon" />
            {{ item.label }}
          </a>
        }
      </nav>
    </ng-template>
  `,
  styles: `
    .trigger {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      inline-size: var(--tap-target);
      block-size: var(--tap-target);
      border: 0;
      background: none;
      color: var(--brand);
      cursor: pointer;
    }

    .module-glyph {
      --icon-size: 20px;
    }

    .hamburger-glyph {
      --icon-size: 14px;
      color: var(--text-muted);
    }

    .popup {
      min-inline-size: 200px;
      padding: var(--space-1);
      background: var(--surface-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
    }

    .link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      color: var(--text);
      text-decoration: none;
      font-size: var(--text-md);
    }

    .link.is-active {
      color: var(--brand);
      background: var(--brand-subtle);
    }
  `,
})
export class ModuleSwitcher {
  private readonly router = inject(Router);

  protected readonly allItems = ALL_NAV_ITEMS;
  protected readonly isOpen = signal(false);
  protected readonly navLabel = $localize`:@@nav.label:Modules`;

  protected close(): void {
    this.isOpen.set(false);
  }

  /** Opens upward: the trigger lives in the bottom bar. */
  protected readonly positions = [
    {
      originX: 'start' as const,
      originY: 'top' as const,
      overlayX: 'start' as const,
      overlayY: 'bottom' as const,
      offsetY: -8,
    },
    {
      originX: 'start' as const,
      originY: 'bottom' as const,
      overlayX: 'start' as const,
      overlayY: 'top' as const,
      offsetY: 8,
    },
  ];

  /**
   * `Router.lastSuccessfulNavigation` is already a Signal in Angular 21, so the
   * active module needs no `router.events` subscription and no `toSignal` —
   * which keeps the no-RxJS rule (PRD-INFRASTRUCTURE.md §3) intact. It is null
   * before the first navigation resolves; `router.url` covers that moment.
   */
  private readonly url = computed(() => {
    const finalUrl = this.router.lastSuccessfulNavigation()?.finalUrl;
    return finalUrl ? this.router.serializeUrl(finalUrl) : this.router.url;
  });

  protected readonly activeItem = computed(
    () =>
      ALL_NAV_ITEMS.find((item) => this.url().startsWith(item.route)) ??
      NAV_ITEMS[0],
  );

  /** Names the module *and* the action — with no text and no hover tooltip on
   * touch, this is the only thing a screen reader gets. */
  protected readonly triggerLabel = computed(
    () =>
      $localize`:@@nav.trigger:${this.activeItem().label}:module: — open navigation`,
  );
}
