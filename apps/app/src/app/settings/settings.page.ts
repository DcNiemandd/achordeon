// Settings page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME, not the module. This gives the settings epic somewhere
// to land without inventing its own chrome.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar } from '../shared/layout';

@Component({
  selector: 'app-settings-page',
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
export class SettingsPage {
  protected readonly title = $localize`:@@settings.title:Settings`;
  protected readonly placeholder = $localize`:@@settings.placeholder:The Settings module lands here.`;
}
