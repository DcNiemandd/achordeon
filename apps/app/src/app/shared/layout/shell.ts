// App shell — Epic 13
// Spec: PRD-UI-SHELL.md §4

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ModuleSwitcher } from './module-switcher';
import { Rail } from './rail';
import { Viewport } from './viewport';
import { chromeOf } from './shell-chrome';

/**
 * The application frame: rail on the left above the breakpoint, a bottom bar
 * below it, and the module in between.
 *
 * The bottom bar is the **shell's** (nav + pane switching); the action bar above
 * pane A is the **feature's**. That split is why the shell never enumerates a
 * module's actions.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Rail, ModuleSwitcher],
  template: `
    <div class="shell" [class.is-bare]="isBare()" data-testid="shell">
      @if (!isBare() && !viewport.isCompact()) {
        <app-rail class="rail-slot" />
      }

      <main class="module" data-testid="module-outlet">
        <router-outlet />
      </main>

      @if (!isBare() && viewport.isCompact()) {
        <div class="bottom-bar" data-testid="bottom-bar">
          <app-module-switcher />
          <div class="bar-slot">
            <!-- The pane switcher and module actions mount here (§4). -->
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .shell {
      display: grid;
      block-size: 100%;
      grid-template-columns: auto 1fr;
      grid-template-rows: 1fr;
    }

    /* Compact: no rail column, and a bar row underneath. */
    .shell:has(.bottom-bar),
    .shell.is-bare {
      grid-template-columns: 1fr;
    }

    .shell:has(.bottom-bar) {
      grid-template-rows: 1fr auto;
    }

    .rail-slot {
      grid-row: 1;
    }

    .module {
      min-inline-size: 0;
      min-block-size: 0;
      overflow: hidden;
    }

    .bottom-bar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-inline: var(--space-1);
      min-block-size: var(--bar-height);
      background: var(--surface-raised);
      border-block-start: 1px solid var(--border);
      /* Home-indicator / gesture bar on iOS. */
      padding-block-end: env(safe-area-inset-bottom, 0);
    }

    .bar-slot {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      margin-inline-start: auto;
    }
  `,
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly viewport = inject(Viewport);

  /**
   * Chrome comes off the deepest matched route's data, so a child route (Stage
   * fullscreen, an Audience session) can strip the frame without its parent
   * knowing.
   */
  protected readonly isBare = computed(() => {
    // Touch the navigation signal so this recomputes on every route change
    // without an events subscription (see ModuleSwitcher for the same trick).
    this.router.lastSuccessfulNavigation();

    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return chromeOf(route.data) === 'none';
  });
}
