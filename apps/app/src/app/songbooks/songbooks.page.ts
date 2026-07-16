// Songbooks page — Epic 13 (frame only)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME, not the module. This gives the songbooks epic somewhere
// to land without inventing its own chrome.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar } from '../shared/layout';

@Component({
  selector: 'app-songbooks-page',
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
export class SongbooksPage {
  protected readonly title = $localize`:@@songbooks.title:Songbooks`;
  protected readonly placeholder = $localize`:@@songbooks.placeholder:The Songbooks module lands here.`;
}
