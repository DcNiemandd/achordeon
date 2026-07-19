// App shell — Epic 13
// Spec: PRD-UI-SHELL.md §4

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { Button } from '../../primitives';
import { Fullscreen } from './fullscreen';
import { LastModule } from './last-module';
import { ModuleSwitcher } from './module-switcher';
import { Panes } from './panes';
import { Rail } from './rail';
import { Viewport } from './viewport';

/**
 * The application frame: rail on the left above the breakpoint, a bottom bar
 * below it, and the module in between.
 *
 * The bottom bar is the **shell's** (nav + pane switching); the action bar above
 * pane A is the **feature's**. That split is why the shell never enumerates a
 * module's actions.
 *
 * **Every route gets the frame.** Performing without chrome is a *mode*
 * (`Fullscreen`), not a property of a route — the frame comes back the moment you
 * move the pointer, wherever you are. An earlier draft made it a route flag; that
 * could not express "hidden right now, back on the next tap".
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Rail, ModuleSwitcher, Button],
  // While performing, any pointer movement or tap brings the bars back.
  host: {
    '(document:pointermove)': 'onActivity()',
    '(document:pointerdown)': 'onActivity()',
    '(document:keydown)': 'onActivity()',
  },
  template: `
    <div class="shell" data-testid="shell">
      @if (isChrome() && !viewport.isCompact()) {
        <app-rail class="rail-slot" />
      }

      <main class="module" data-testid="module-outlet">
        <router-outlet />
      </main>

      @if (isChrome() && viewport.isCompact()) {
        <div class="bottom-bar" data-testid="bottom-bar">
          <app-module-switcher />
          <div class="bar-slot">
            <!-- The pane switcher: segmented, and only in split modules (§4).
                 It is the shell's, because the bar is; which panes exist is the
                 feature's, and reaches us through the Panes service. -->
            @if (panes.isSplit()) {
              <div
                class="switcher"
                role="group"
                [attr.aria-label]="paneGroupLabel"
                data-testid="pane-switcher"
              >
                @for (option of paneOptions; track option.pane) {
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    [class.is-active]="panes.active() === option.pane"
                    [attr.aria-pressed]="panes.active() === option.pane"
                    [attr.data-testid]="'pane-' + option.value"
                    (click)="showPane(option.value)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            }
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
    .shell:has(.bottom-bar) {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    /* Fullscreen with the chrome hidden: the module is the whole window. */
    .shell:not(:has(.rail-slot)):not(:has(.bottom-bar)) {
      grid-template-columns: 1fr;
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

    /* Takes the bar's leftover width rather than hugging its own content. The
       module switcher keeps its natural size on the left; everything after it is
       the pane switcher's. */
    .bar-slot {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .switcher {
      flex: 1;
      display: flex;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }

    /* Source and Render are the primary act on a small screen — this bar is how
       you get between writing the song and looking at it, and there is nothing
       else competing for the space. Two shrink-to-fit labels made a pair of
       ~60px targets floating at one end of an otherwise empty bar; an even split
       of the full width is both easier to hit and easier to read as a toggle. */
    .switcher > button {
      flex: 1;
      min-inline-size: 0;
      block-size: 36px;
    }
  `,
})
export class Shell {
  protected readonly viewport = inject(Viewport);
  protected readonly panes = inject(Panes);
  private readonly fullscreen = inject(Fullscreen);
  /**
   * Injected for its side effect, not for anything the shell draws: it has to be
   * alive from boot to see every navigation, and the shell is the one thing that
   * always is. See `LastModule` for why tracking cannot be lazy.
   */
  private readonly lastModule = inject(LastModule);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isChrome = this.fullscreen.isChromeVisible;

  protected readonly paneGroupLabel = $localize`:@@shell.panes:Show`;

  /** `?pane=source|render` (§7). The URL's words are the user's words; `a`/`b`
   * is the split's internal vocabulary and stays out of the address bar. */
  protected readonly paneOptions = [
    {
      pane: 'a' as const,
      value: 'source',
      label: $localize`:@@shell.paneSource:Source`,
    },
    {
      pane: 'b' as const,
      value: 'render',
      label: $localize`:@@shell.paneRender:Render`,
    },
  ];

  /** Into the URL, so it survives a reload and a rotation, and so a link can
   * land straight on the render (§7). */
  protected showPane(value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pane: value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onActivity(): void {
    if (this.fullscreen.isActive()) {
      this.fullscreen.reveal();
    }
  }
}
