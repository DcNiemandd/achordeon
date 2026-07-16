// Songs page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME, not the module. The explorer, the editor and the live
// preview are Epic 5; this proves the split, the action bar and the blank page,
// and gives that epic somewhere to land.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button, EmptyState, Icon, Tooltip } from '../primitives';
import { ActionBar, BlankPage, SplitPane, UiStore } from '../shared/layout';

@Component({
  selector: 'app-songs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBar, BlankPage, SplitPane, Button, Icon, Tooltip, EmptyState],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="title">
          <button
            appButton
            [isIconOnly]="true"
            [attr.aria-label]="addLabel"
            [appTooltip]="addLabel"
            data-testid="songs-add"
          >
            <app-icon name="add" />
          </button>
          <button
            appButton
            [isIconOnly]="true"
            [attr.aria-label]="searchLabel"
            [appTooltip]="searchLabel"
            data-testid="songs-search"
          >
            <app-icon name="search" />
          </button>
        </app-action-bar>

        <app-empty-state [text]="explorerPlaceholder" />
      </div>

      <!-- Pane B: the render. "Rendered output always visible on the right"
           is a DESKTOP promise — below the breakpoint this pane is a tab. -->
      <app-blank-page pane-b />
    </app-split-pane>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }
  `,
})
export class SongsPage {
  protected readonly ui = inject(UiStore);

  protected readonly title = $localize`:@@songs.title:Songs`;
  protected readonly addLabel = $localize`:@@songs.add:New song`;
  protected readonly searchLabel = $localize`:@@songs.search:Search`;
  protected readonly explorerPlaceholder = $localize`:@@songs.explorerPlaceholder:The song explorer lands here.`;
}
