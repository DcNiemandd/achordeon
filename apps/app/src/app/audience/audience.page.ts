// Audience page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4
//
// Keeps the normal shell layout. Performing without chrome is the Fullscreen
// MODE, which this offers as an action — the bars come back on the next tap.
//
// Epic 13 lands the FRAME. Lobby, PIN and QR are Epic 9.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button, EmptyState, Icon, Tooltip } from '../primitives';
import { ActionBar, BlankPage, Fullscreen } from '../shared/layout';

@Component({
  selector: 'app-audience-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBar, BlankPage, Button, Icon, Tooltip, EmptyState],
  template: `
    <app-action-bar [title]="title">
      <button
        appButton
        type="button"
        [isIconOnly]="true"
        [attr.aria-label]="fullscreenLabel()"
        [attr.aria-pressed]="fullscreen.isActive()"
        [appTooltip]="fullscreenLabel()"
        data-testid="audience-fullscreen"
        (click)="fullscreen.toggle()"
      >
        <app-icon [name]="fullscreen.isActive() ? 'close' : 'stage'" />
      </button>
    </app-action-bar>

    <app-blank-page>
      <app-empty-state [text]="placeholder" />
    </app-blank-page>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    app-blank-page {
      flex: 1;
      min-block-size: 0;
    }
  `,
})
export class AudiencePage {
  protected readonly fullscreen = inject(Fullscreen);

  protected readonly title = $localize`:@@audience.title:Audience`;
  protected readonly placeholder = $localize`:@@audience.placeholder:The performer's song appears here.`;

  protected fullscreenLabel(): string {
    return this.fullscreen.isActive()
      ? $localize`:@@fullscreen.exit:Exit fullscreen`
      : $localize`:@@fullscreen.enter:Fullscreen`;
  }
}
