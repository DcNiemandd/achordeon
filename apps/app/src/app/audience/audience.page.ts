// Audience page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4 (chrome-less routes)
//
// This route declares `chrome: 'none'` (app.routes.ts): the shell frame is gone,
// because a viewer following along sees the song and nothing else. That means
// this page owns its own way back — with no rail and no bottom bar, nothing else
// provides one.
//
// Epic 13 lands the FRAME. Lobby, PIN and QR are Epic 9.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, EmptyState, Icon } from '../primitives';
import { BlankPage } from '../shared/layout';

@Component({
  selector: 'app-audience-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BlankPage, Button, Icon, EmptyState],
  template: `
    <div class="bare" data-testid="audience-bare">
      <a
        appButton
        variant="ghost"
        routerLink="/songs"
        class="exit"
        [attr.aria-label]="exitLabel"
        data-testid="audience-exit"
      >
        <app-icon name="close" />
      </a>

      <app-blank-page>
        <app-empty-state [text]="placeholder" />
      </app-blank-page>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .bare {
      position: relative;
      block-size: 100%;
    }

    .exit {
      position: absolute;
      inset-block-start: var(--space-2);
      inset-inline-end: var(--space-2);
      z-index: 1;
      aspect-ratio: 1;
      padding-inline: 0;
    }
  `,
})
export class AudiencePage {
  protected readonly exitLabel = $localize`:@@audience.exit:Leave audience`;
  protected readonly placeholder = $localize`:@@audience.placeholder:The performer's song appears here.`;
}
