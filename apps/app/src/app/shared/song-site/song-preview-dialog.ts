// Song preview dialog — plans/import-chord-sheets.md phase 6 (Q18–Q20)
//
// The song as Achordeon would print it, before anything is saved: our own
// render of the converted Content, a version picker when the site has several,
// and where it came from, linked. Nothing here is editable; the editor is where
// Import leads.
//
// It replaces the Song site dialog rather than stacking on it (Q18): Back is a
// way out of this one into that one, not a close.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Button, Dialog, Icon } from '../../primitives';
import { BlankPage } from '../layout/blank-page';
import { SongRender } from '../song-render/song-render';

@Component({
  selector: 'app-song-preview-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BlankPage, Button, Dialog, Icon, SongRender],
  template: `
    <app-dialog
      size="large"
      [title]="heading()"
      data-testid="song-preview-dialog"
      (closed)="closed.emit()"
    >
      <div class="preview">
        <div class="meta">
          <a
            class="source"
            [href]="url()"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="song-preview-source"
            >{{ fromSite() }}</a
          >
          @if (versions().length > 1) {
            <label class="version">
              <span>{{ versionLabel }}</span>
              <select
                class="control"
                data-testid="song-preview-version"
                (change)="versionChosen.emit(index($event))"
              >
                @for (label of versions(); track $index) {
                  <option [value]="$index" [selected]="$index === version()">
                    {{ label }}
                  </option>
                }
              </select>
            </label>
          }
        </div>

        <div class="page">
          <app-blank-page [ratio]="ratio()" [isDark]="isDark()">
            <app-song-render [svg]="svg()" />
          </app-blank-page>
        </div>
      </div>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="song-preview-back"
        (click)="back.emit()"
      >
        <app-icon name="chevronLeft" />
        {{ backLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="song-preview-import"
        (click)="imported.emit()"
      >
        <app-icon name="import" />
        {{ importLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    /* The songbook's song preview: a large dialog whose body the page fills,
       so the header and the actions never move. The source line sits on top. */
    .preview {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-block-end: var(--space-3);
      font-size: var(--text-sm);
    }

    .source {
      color: var(--text-muted);
    }

    .version {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    /* The dialogs' select, as the feedback and PDF fields draw it. */
    .control {
      min-inline-size: 8rem;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    /* What the source line leaves. Block, not flex: the desk is a size
       container, so as a flex item it would shrink to zero width. */
    .page {
      flex: 1;
      min-block-size: 0;
    }
  `,
})
export class SongPreviewDialog {
  readonly title = input.required<string>();
  readonly artist = input('');
  readonly siteName = input.required<string>();
  /** The page on the site, for "from <site>" (Q19). */
  readonly url = input.required<string>();
  /** One label per version; a picker only when there is more than one. */
  readonly versions = input<readonly string[]>([]);
  readonly version = input(0);
  readonly svg = input.required<string>();
  readonly ratio = input(210 / 297);
  readonly isDark = input(false);

  readonly versionChosen = output<number>();
  readonly back = output<void>();
  readonly imported = output<void>();
  readonly closed = output<void>();

  protected readonly heading = computed(() =>
    this.artist() ? `${this.title()} · ${this.artist()}` : this.title(),
  );

  protected readonly fromSite = computed(
    () => $localize`:@@songPreview.from:from ${this.siteName()}:site:`,
  );

  protected index(event: Event): number {
    return Number((event.target as HTMLSelectElement).value);
  }

  protected readonly versionLabel = $localize`:@@songPreview.version:Version`;
  protected readonly backLabel = $localize`:@@songPreview.back:Back to search`;
  protected readonly importLabel = $localize`:@@songPreview.import:Import`;
}
