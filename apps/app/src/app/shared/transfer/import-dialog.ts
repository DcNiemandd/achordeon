// Import dialog — Epic 7 ▸ subtask 3
// Spec: PRD-INFRASTRUCTURE.md §8 (songs replace / ignore / create-new, + import
// all as new with a date prefix; songbooks always create new)
//
// The step between reading a file and writing it. It exists because "what would
// this file do to my library" has to be answerable *before* anything is written
// — a file that silently overwrote nineteen songs because the twentieth matched
// would be indefensible.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog, Icon } from '../../primitives';
import type {
  ImportChoice,
  ImportPreview,
  ImportResolutionChoice,
} from './transfer-model';

/** How many collisions to spell out before the list becomes a wall of names. */
const NAMED_CONFLICTS = 5;

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
      <p class="summary" data-testid="import-summary">{{ summary() }}</p>

      @if (preview().hasUnknownSettings) {
        <p class="note" data-testid="import-unknown">
          <app-icon name="warning" class="note-icon" />
          {{ unknownText }}
        </p>
      }

      @if (preview().conflicts.length > 0) {
        <p class="summary" data-testid="import-conflicts">
          {{ conflictText() }}
        </p>
        <!-- Named, not counted: "3 songs already exist" is a number, and the
             answer depends on WHICH three. -->
        <ul class="names">
          @for (row of named(); track row.id) {
            <li>{{ nameOf(row.incomingName, row.existingName) }}</li>
          }
          @if (moreCount() > 0) {
            <li class="more">{{ moreText() }}</li>
          }
        </ul>

        <fieldset class="options">
          <legend class="legend">{{ resolutionLegend }}</legend>
          @for (option of resolutions; track option.value) {
            <label class="option">
              <input
                type="radio"
                name="import-resolution"
                [value]="option.value"
                [checked]="resolution() === option.value"
                [disabled]="isAllNew()"
                [attr.data-testid]="'import-' + option.value"
                (change)="resolution.set(option.value)"
              />
              <span>{{ option.label }}</span>
            </label>
          }
        </fieldset>
      }

      <!-- Outside the conflict block: importing everything as a copy is a
           decision about the whole file, and it is answerable even when nothing
           collides at all. -->
      <label class="option all-new">
        <input
          type="checkbox"
          [checked]="isAllNew()"
          data-testid="import-all-new"
          (change)="isAllNew.set(checked($event))"
        />
        <span>{{ allNewLabel }}</span>
      </label>

      <p class="note">{{ songbookNote }}</p>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="import-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="import-confirm"
        (click)="
          confirmed.emit({ resolution: resolution(), isAllNew: isAllNew() })
        "
      >
        {{ importLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .summary {
      margin: 0 0 var(--space-2);
    }

    .names {
      margin: 0 0 var(--space-3);
      padding-inline-start: var(--space-4);
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .more {
      list-style: none;
    }

    .options {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0 0 var(--space-3);
      padding: 0;
      border: 0;
    }

    .legend {
      padding: 0 0 var(--space-1);
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
    }

    .note {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: var(--space-2) 0 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .note-icon {
      --icon-size: 16px;
      flex: none;
      color: var(--brand);
    }
  `,
})
export class ImportDialog {
  readonly preview = input.required<ImportPreview>();

  readonly confirmed = output<ImportChoice>();
  readonly closed = output<void>();

  /** Replace is the default: the file is usually the newer copy — it is the one
   * you just brought over — and ignoring by default makes an import that looks
   * like it did nothing. */
  protected readonly resolution = signal<ImportResolutionChoice>('replace');
  protected readonly isAllNew = signal(false);

  protected readonly named = computed(() =>
    this.preview().conflicts.slice(0, NAMED_CONFLICTS),
  );
  protected readonly moreCount = computed(() =>
    Math.max(this.preview().conflicts.length - NAMED_CONFLICTS, 0),
  );

  protected readonly summary = computed(() => {
    const { songCount, songbookCount } = this.preview();
    return $localize`:@@import.summary:This file holds ${songCount}:songs: songs and ${songbookCount}:books: songbooks.`;
  });

  protected readonly conflictText = computed(
    () =>
      $localize`:@@import.conflicts:${this.preview().conflicts.length}:count: of them are already in your library:`,
  );

  protected readonly moreText = computed(
    () => $localize`:@@import.more:…and ${this.moreCount()}:count: more.`,
  );

  protected nameOf(incoming: string, existing: string): string {
    return incoming === existing
      ? incoming
      : $localize`:@@import.renamed:${incoming}:incoming: (yours: ${existing}:existing:)`;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected readonly resolutions: {
    value: ImportResolutionChoice;
    label: string;
  }[] = [
    {
      value: 'replace',
      label: $localize`:@@import.replace:Replace mine with the imported version`,
    },
    {
      value: 'ignore',
      label: $localize`:@@import.ignore:Keep mine and skip them`,
    },
    {
      value: 'new',
      label: $localize`:@@import.new:Keep both — import them as new songs`,
    },
  ];

  protected readonly title = $localize`:@@import.title:Import`;
  protected readonly resolutionLegend = $localize`:@@import.legend:What should happen to those?`;
  protected readonly allNewLabel = $localize`:@@import.allNew:Import everything as new, with today's date in the name`;
  protected readonly songbookNote = $localize`:@@import.songbookNote:Songbooks are always added as new — an existing one is never overwritten.`;
  protected readonly unknownText = $localize`:@@import.unknown:This file was made by a newer version. Settings this one does not know are kept, but not shown.`;
  protected readonly cancelLabel = $localize`:@@import.cancel:Cancel`;
  protected readonly importLabel = $localize`:@@import.confirm:Import`;
}
