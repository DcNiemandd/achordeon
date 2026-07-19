// Songbook detail page — Epic 6 (frame only, landed early)
// Spec: PRD-UI-SHELL.md §4 (pane A: song explorer, pane B: songbook entries)
//
// This is Epic 6's screen. It exists now because Epic 5's in-use delete warning
// links to it: CONTEXT.md §Delete vs Remove promises "a link that opens the
// Songbook and auto-selects the Song", and a promise that lands on the wildcard
// redirect is worse than no link. The song is already selected in `SessionStore`
// by the time this mounts; Epic 6 fills the panes in.

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar } from '../shared/layout';

@Component({
  selector: 'app-songbook-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBar, EmptyState],
  template: `
    <app-action-bar [title]="title" />
    <app-empty-state [text]="placeholder" data-testid="songbook-detail" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }
  `,
})
export class SongbookDetailPage {
  /** `/songbooks/:id`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  protected readonly title = $localize`:@@songbooks.detailTitle:Songbook`;
  protected readonly placeholder = $localize`:@@songbooks.detailPlaceholder:The songbook builder lands here.`;
}
