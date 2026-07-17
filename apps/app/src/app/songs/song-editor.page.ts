// Song editor page — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §4; ADR-0010

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { Button, Icon, Tooltip } from '../primitives';
import { RouterLink } from '@angular/router';
import { ActionBar, BlankPage, SplitPane, UiStore } from '../shared/layout';
import { SongEditor } from './editor/song-editor';
import { SongEditorPresenter } from './song-editor.presenter';

/**
 * The authoring screen: content on the left, the render on the right (§4).
 *
 * The insert/transpose bar (subtask 5), the live preview (subtask 6) and the
 * settings dialog (subtask 7) mount into this shape.
 */
@Component({
  selector: 'app-song-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongEditorPresenter],
  imports: [
    RouterLink,
    ActionBar,
    BlankPage,
    SplitPane,
    SongEditor,
    Button,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="presenter.name()">
          <!-- A link, because it navigates: it must middle-click, open in a
               new tab, and announce as a link (see the Button directive). -->
          <a
            appButton
            bar-end
            routerLink="/songs"
            [attr.aria-label]="backLabel"
            [appTooltip]="backLabel"
            data-testid="editor-back"
          >
            <app-icon name="close" />
          </a>
        </app-action-bar>

        <app-song-editor
          class="editor"
          [content]="presenter.content()"
          [markers]="presenter.markers()"
          (contentChange)="presenter.setContent($event)"
        />
      </div>

      <!-- The render lands here in subtask 6. -->
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
      min-block-size: 0;
    }

    .editor {
      flex: 1;
      min-block-size: 0;
      overflow: hidden;
    }
  `,
})
export class SongEditorPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongEditorPresenter);

  /** `/songs/:id/edit`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  protected readonly backLabel = $localize`:@@editor.back:Back to songs`;

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });
  }
}
