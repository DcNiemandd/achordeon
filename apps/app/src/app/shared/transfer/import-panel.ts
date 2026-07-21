// Import panel — the file-picking half of import, shared by every module
//
// The import *flow* — read a file, preview what it would do, apply it, refresh
// the stores — is a presenter's job (it touches data-access, which this folder
// may not). What is the same everywhere is the **UI around it**: a hidden file
// input, the preview dialog, and the "could not read that" dialog. That is what
// lives here, so the Songs module and the Songbooks module mount one component
// instead of copying three.
//
// Controlled, like every panel in `app/shared`: state in as inputs, intents out
// as outputs. It owns no store and no plan — only the file input it drives on
// the page's behalf.

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import { ImportDialog } from './import-dialog';
import type {
  ImportChoice,
  ImportFailure,
  ImportPreview,
} from './transfer-model';

@Component({
  selector: 'app-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImportDialog, Dialog, Button],
  template: `
    <!-- The real control. Not display:none, which makes it unfocusable and, in
         some engines, unclickable from script. The page's own Import button
         calls pick() rather than styling a bare file input. -->
    <input
      #file
      class="file"
      type="file"
      accept="application/json,.json,image/png,.png"
      tabindex="-1"
      aria-hidden="true"
      [attr.data-testid]="inputTestid()"
      (change)="onPicked($event)"
    />

    @if (preview(); as preview) {
      <app-import-dialog
        [preview]="preview"
        (confirmed)="confirmed.emit($event)"
        (closed)="dismissed.emit()"
      />
    }

    @if (error(); as failure) {
      <app-dialog
        [title]="failedTitle"
        data-testid="import-error-dialog"
        (closed)="dismissed.emit()"
      >
        <p class="warn">{{ failedText(failure) }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="import-error-close"
          (click)="dismissed.emit()"
        >
          {{ okLabel }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    .file {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .warn {
      margin: 0 0 var(--space-2);
    }
  `,
})
export class ImportPanel {
  /** The preview a read produced, or null. Drives the import dialog. */
  readonly preview = input<ImportPreview | null>(null);
  /** A read that failed, or null. Drives the error dialog. */
  readonly error = input<ImportFailure | null>(null);
  /** The file input's `data-testid` — each module names its own so a suite can
   * say which page's import it means. */
  readonly inputTestid = input('import-input');

  /** A file was chosen — the presenter reads it. */
  readonly picked = output<File>();
  /** The user confirmed the preview — the presenter applies it. */
  readonly confirmed = output<ImportChoice>();
  /** The preview or the error was dismissed — the presenter clears its state. */
  readonly dismissed = output<void>();

  private readonly fileInput =
    viewChild.required<ElementRef<HTMLInputElement>>('file');

  /** Open the OS file picker. The page's Import button calls this. */
  pick(): void {
    this.fileInput().nativeElement.click();
  }

  /**
   * A picked file, and then the input is cleared.
   *
   * Without the reset, picking the same file twice in a row fires no `change`
   * the second time — the value has not changed — and the user is left pressing
   * a button that does nothing after cancelling out of the dialog once.
   */
  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.picked.emit(file);
  }

  protected failedText(failure: ImportFailure): string {
    return failure === 'refused'
      ? $localize`:@@import.refused:It was made by a newer version of Achordeon. Update the app, then try again.`
      : $localize`:@@import.unreadable:It is not an Achordeon export. Pick a JSON file exported from Achordeon, or a PNG downloaded from it.`;
  }

  protected readonly failedTitle = $localize`:@@import.failedTitle:That file could not be imported`;
  protected readonly okLabel = $localize`:@@import.ok:OK`;
}
