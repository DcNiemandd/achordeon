// The import dialogs, mounted once — plan §4 / §7
//
// The preview and the "could not be imported" dialog used to live in
// `ImportPanel`, one copy per module. They belong to whatever arrived, not to
// whichever page happened to be open: a file can be dropped on a page that mounts
// no panel, and a link belongs to no page at all. So they are mounted once, at the
// shell, against the one owner.
//
// Controlled, like every panel in `app/shared`: state in as inputs, intents out as
// outputs. It owns no store and no plan.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import { ImportDialog } from './import-dialog';
import type {
  ImportChoice,
  ImportFailure,
  ImportPreview,
} from './transfer-model';

@Component({
  selector: 'app-import-inbox-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImportDialog, Dialog, Button],
  template: `
    @if (preview(); as preview) {
      <app-import-dialog
        [preview]="preview"
        [remaining]="remaining()"
        (confirmed)="confirmed.emit($event)"
        (closed)="skipped.emit()"
        (cancelledAll)="cancelledAll.emit()"
      />
    }

    @if (error(); as failure) {
      <app-dialog
        [title]="failedTitle"
        data-testid="import-error-dialog"
        (closed)="skipped.emit()"
      >
        <p class="warn">{{ failedText(failure) }}</p>
        @if (remaining() > 0) {
          <button
            dialog-actions
            appButton
            type="button"
            variant="secondary"
            data-testid="import-error-cancel-all"
            (click)="cancelledAll.emit()"
          >
            {{ cancelAllLabel }}
          </button>
        }
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="import-error-close"
          (click)="skipped.emit()"
        >
          {{ okLabel }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    .warn {
      margin: 0 0 var(--space-2);
    }
  `,
})
export class ImportInboxPanel {
  /** The preview a read produced, or null. Drives the import dialog. */
  readonly preview = input<ImportPreview | null>(null);
  /** A read that failed, or null. Drives the error dialog. */
  readonly error = input<ImportFailure | null>(null);
  /** How many are still waiting behind this one. */
  readonly remaining = input(0);

  /** The user confirmed the preview — apply it, then take the next. */
  readonly confirmed = output<ImportChoice>();
  /** Not this one — take the next. */
  readonly skipped = output<void>();
  /** This one and everything still waiting. */
  readonly cancelledAll = output<void>();

  protected failedText(failure: ImportFailure): string {
    return failure === 'refused'
      ? $localize`:@@import.refused:It was made by a newer version of Achordeon. Update the app, then try again.`
      : $localize`:@@import.unreadable:It is not an Achordeon export. Pick a JSON file exported from Achordeon, or a PNG downloaded from it.`;
  }

  protected readonly failedTitle = $localize`:@@import.failedTitle:That file could not be imported`;
  protected readonly okLabel = $localize`:@@import.ok:OK`;
  protected readonly cancelAllLabel = $localize`:@@import.errorCancelAll:Cancel the rest`;
}
