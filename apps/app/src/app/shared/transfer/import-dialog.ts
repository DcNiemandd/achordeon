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

      <!-- Said before anything is written. Import compares ids and never looks
           at the content, so without this a song whose markup is wrong lands
           silently and is discovered on the page. -->
      @if (preview().flaggedSongs.length > 0) {
        <p class="note" data-testid="import-flagged">
          <app-icon name="warning" class="note-icon" />
          {{ flaggedText() }}
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

      <!-- Several files at once are previewed one after another, so Cancel here
           means "not this one" and the queue moves on. That needs a way out, or
           leaving a five-file drop costs five clicks — hence the second button,
           which appears only when there is actually something behind this. -->
      @if (remaining() > 0) {
        <button
          dialog-actions
          appButton
          type="button"
          variant="secondary"
          data-testid="import-cancel-all"
          (click)="cancelledAll.emit()"
        >
          {{ cancelAllLabel() }}
        </button>
      }
      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="import-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel() }}
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
  /** How many more files are queued behind this one. Several dropped at once are
   * previewed one after another — `planImport` computes conflicts against the
   * library as it stands, so the second cannot be planned until the first is
   * applied. Zero for a picked file or a link, which is the usual case. */
  readonly remaining = input(0);

  readonly confirmed = output<ImportChoice>();
  /** This one is not wanted — the queue moves on. */
  readonly closed = output<void>();
  /** This one and everything still waiting. */
  readonly cancelledAll = output<void>();

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
    const held = $localize`:@@import.summary:This file holds ${songCount}:songs: songs and ${songbookCount}:books: songbooks.`;
    const rest = this.remaining();
    if (rest === 0) return held;
    // A dropped queue has to say so, or the second dialog reads as the first one
    // failing to close.
    return `${held} ${$localize`:@@import.queued:${rest}:count: more files after this one.`}`;
  });

  /** "Cancel" while a queue is running would read as "stop", which is not what it
   * does — so it says what it does, and the way out gets its own button. */
  protected readonly cancelLabel = computed(() =>
    this.remaining() === 0
      ? $localize`:@@import.cancel:Cancel`
      : $localize`:@@import.skipOne:Skip this one`,
  );

  protected readonly cancelAllLabel = computed(
    () =>
      $localize`:@@import.cancelAll:Cancel all ${this.remaining() + 1}:count:`,
  );

  protected readonly conflictText = computed(
    () =>
      $localize`:@@import.conflicts:${this.preview().conflicts.length}:count: of them are already in your library:`,
  );

  /**
   * Not "your tooling is old" but "these songs have problems", which is what the
   * person actually wants to know before accepting them. It says the import still
   * happens, because it does — the point is to look afterwards, not to stop.
   *
   * Named, like the conflicts above: a count says how bad it is, a name says
   * where to go.
   */
  protected readonly flaggedText = computed(
    () =>
      $localize`:@@import.flagged:Achordeon couldn't understand these songs: ${this.preview().flaggedSongs.join(', ')}:songs:. They will still import but you should check them afterwards.`,
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
  protected readonly importLabel = $localize`:@@import.confirm:Import`;
}
