// Stage page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME, not the module. This gives the stage epic somewhere
// to land without inventing its own chrome.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar } from '../shared/layout';

@Component({
  selector: 'app-stage-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBar, EmptyState],
  template: `
    <app-action-bar [title]="title" />
    <app-empty-state [text]="placeholder" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }
  `,
})
export class StagePage {
  protected readonly title = $localize`:@@stage.title:Stage`;
  protected readonly placeholder = $localize`:@@stage.placeholder:The Stage module lands here.`;
}
