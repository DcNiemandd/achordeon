// Import dialog (CONTEXT.md §Import dialog) — plans/import-chord-sheets.md, phase 3 (Q3)
//
// Where an Import starts: one row per way in, laid out like the Download dialog
// it mirrors — what the row is for on the left, the button that does it on the
// right. A file row ends in the file picker for its own kind of file and hands
// the chosen files over; reading, previewing and writing them is the Import
// preview's job (`ImportInbox`), the same as for a drop or a link.
//
// Controlled: it holds no state, injects nothing, and knows no store.

import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CHORD_SHEET_EXTENSIONS } from '@achordeon/shared/domain';
import { Button, Dialog, Icon } from '../../primitives';

@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog, Icon],
  template: `
    <app-dialog
      [title]="title"
      data-testid="import-dialog"
      (closed)="closed.emit()"
    >
      <div class="options">
        <div class="option">
          <div class="text">
            <span class="name">{{ achordeonLabel }}</span>
            <span class="hint">{{ achordeonHint }}</span>
          </div>
          <button
            appButton
            type="button"
            variant="primary"
            class="go"
            data-testid="import-achordeon"
            (click)="achordeonInput.click()"
          >
            <app-icon name="import" />
            {{ chooseLabel }}
          </button>
          <input
            #achordeonInput
            class="file"
            type="file"
            multiple
            tabindex="-1"
            aria-hidden="true"
            [accept]="achordeonAccept"
            data-testid="import-achordeon-input"
            (change)="onPicked($event)"
          />
        </div>

        <div class="option">
          <div class="text">
            <span class="name">{{ chordSheetLabel }}</span>
            <span class="hint">{{ chordSheetHint }}</span>
          </div>
          <button
            appButton
            type="button"
            variant="primary"
            class="go"
            data-testid="import-chord-sheet"
            (click)="chordSheetInput.click()"
          >
            <app-icon name="import" />
            {{ chooseLabel }}
          </button>
          <input
            #chordSheetInput
            class="file"
            type="file"
            multiple
            tabindex="-1"
            aria-hidden="true"
            [accept]="chordSheetAccept"
            data-testid="import-chord-sheet-input"
            (change)="onPicked($event)"
          />
        </div>
      </div>
    </app-dialog>
  `,
  styles: `
    .options {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-3);
    }

    .option {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      align-items: start;
    }

    .text {
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      font-weight: 500;
    }

    .hint {
      color: var(--text-muted);
      font-size: var(--text-xs);
      white-space: normal;
    }

    .go {
      inline-size: 100%;
    }

    /* The real control, opened by the row's button. Not display:none, which
       makes it unfocusable and, in some engines, unclickable from script. */
    .file {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class ImportDialog {
  /** Files the person chose in one of the pickers. */
  readonly picked = output<readonly File[]>();
  readonly closed = output<void>();

  /**
   * `.achordeon` is the registered extension; `.json` stays because every file
   * already exported is one. The PNG is the download that carries its own
   * metadata — "a picture of my song" and "my song" in one file.
   */
  protected readonly achordeonAccept =
    'application/vnd.achordeon+json,.achordeon,application/json,.json,image/png,.png';
  protected readonly chordSheetAccept = [
    'text/plain',
    ...CHORD_SHEET_EXTENSIONS,
  ].join(',');

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared, so choosing the same file again still fires `change`.
    input.value = '';
    if (files.length > 0) {
      this.picked.emit(files);
    }
  }

  protected readonly title = $localize`:@@importDialog.title:Import`;
  protected readonly chooseLabel = $localize`:@@importDialog.choose:Choose file`;
  protected readonly achordeonLabel = $localize`:@@importDialog.achordeon:Achordeon file`;
  protected readonly achordeonHint = $localize`:@@importDialog.achordeon.hint:Songs and songbooks exported from Achordeon, or a downloaded song picture.`;
  protected readonly chordSheetLabel = $localize`:@@importDialog.chordSheet:Chord sheet`;
  protected readonly chordSheetHint = $localize`:@@importDialog.chordSheet.hint:ChordPro, or text with chords above the words (.cho, .chordpro, .crd, .pro, .txt).`;
}
