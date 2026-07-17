// Song editor page — Epic 5 (frame only)
// Spec: PRD-UI-SHELL.md §4; ADR-0010
//
// The frame lands first, the module fills it — the same order Epic 13 used for
// `/songs`. The CodeMirror adapter (subtask 4), the insert/transpose bar
// (subtask 5), the live preview (subtask 6) and the settings dialog (subtask 7)
// each mount into this shape.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar, BlankPage, SplitPane, UiStore } from '../shared/layout';

@Component({
  selector: 'app-song-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBar, BlankPage, SplitPane, EmptyState],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="title" />
        <app-empty-state
          [text]="placeholder"
          data-testid="editor-placeholder"
        />
      </div>

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
export class SongEditorPage {
  protected readonly ui = inject(UiStore);

  /** `/songs/:id/edit`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  protected readonly title = $localize`:@@editor.title:Edit song`;
  protected readonly placeholder = $localize`:@@editor.placeholder:The editor lands here.`;
}
