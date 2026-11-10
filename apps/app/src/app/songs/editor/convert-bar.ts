// The Convert bar — plans/import-chord-sheets.md, phase 2 (Q5, Q8, Q34)
//
// Asks, never acts: a paste lands as it was pasted, and this bar offers to turn
// it into Achordeon markup. It takes the latest paste and answers with the text
// to put in its place; the editor does the swapping (`replacePaste`), as one
// undo step, so Undo always brings back exactly what was pasted.
//
// One question, asked once: Convert answers it and the bar goes; the cross
// answers "keep it as pasted" and the bar goes. Undo is the way back from a
// conversion, so the bar has nothing left to offer after one.
//
// It floats over the top of the text rather than taking a row of its own, so
// nothing the person is looking at moves when it comes or goes (Q34).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  ChordTheory,
  convertChordSheet,
  type ChordNotation,
  type ConvertedChordSheet,
} from '@achordeon/shared/domain';
import { Button, Icon, Tooltip } from '../../primitives';

@Component({
  selector: 'app-convert-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Tooltip],
  template: `
    @if (sheet()) {
      <div
        class="bar"
        role="region"
        [attr.aria-label]="regionLabel"
        data-testid="convert-bar"
      >
        <span class="message">{{ message }}</span>

        <div class="dialect" role="group" [attr.aria-label]="dialectLabel">
          <span class="dialect-label" aria-hidden="true">{{
            dialectLabel
          }}</span>
          <button
            appButton
            type="button"
            variant="ghost"
            [attr.aria-pressed]="dialect() === 'english'"
            data-testid="convert-bar-english"
            (click)="choose('english')"
          >
            {{ englishLabel }}
          </button>
          <button
            appButton
            type="button"
            variant="ghost"
            [attr.aria-pressed]="dialect() === 'german'"
            data-testid="convert-bar-german"
            (click)="choose('german')"
          >
            {{ germanLabel }}
          </button>
        </div>

        <div class="actions">
          <button
            appButton
            type="button"
            variant="primary"
            data-testid="convert-bar-convert"
            (click)="convert()"
          >
            {{ convertLabel }}
          </button>
          <button
            appButton
            type="button"
            variant="ghost"
            [isIconOnly]="true"
            [attr.aria-label]="keepLabel"
            [appTooltip]="keepLabel"
            data-testid="convert-bar-close"
            (click)="dismissed.emit()"
          >
            <app-icon name="close" />
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset-inline: var(--space-2);
      top: var(--space-2);
      z-index: 2;
      pointer-events: none;
    }
    .bar {
      pointer-events: auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-2) var(--space-3);
      background: var(--surface-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-2);
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      color: var(--text);
    }
    .message {
      flex: 1 1 12rem;
    }
    .dialect,
    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }
    .dialect-label {
      color: var(--text-muted);
      margin-inline-end: var(--space-1);
    }
    [aria-pressed='true'] {
      background: var(--brand-subtle);
      color: var(--text);
    }
  `,
})
export class ConvertBar {
  private readonly theory = inject(ChordTheory);

  /** The latest paste, or null once it can no longer be replaced. */
  readonly paste = input<string | null>(null);

  /** The text to put where the paste is. */
  readonly replace = output<string>();
  /** The person is done with this paste; the caller clears `paste`. */
  readonly dismissed = output<void>();

  /** The paste read as a Chord sheet, or null when it is not one. */
  protected readonly sheet = computed<ConvertedChordSheet | null>(() => {
    const paste = this.paste();
    if (!paste) {
      return null;
    }
    const result = convertChordSheet(paste, this.theory);
    return result.kind === 'converted' ? result : null;
  });

  /** Starts at the guess for every new paste; the person may flip it. */
  protected readonly dialect = linkedSignal<ChordNotation>(
    () => this.sheet()?.guessedDialect ?? 'english',
  );

  protected convert(): void {
    this.replace.emit(this.converted());
    this.dismissed.emit();
  }

  protected choose(dialect: ChordNotation): void {
    this.dialect.set(dialect);
  }

  /** The paste converted in the chosen dialect, ending the way the paste ended. */
  private converted(): string {
    const paste = this.paste() ?? '';
    const result = convertChordSheet(paste, this.theory, {
      dialect: this.dialect(),
    });
    const content = result.kind === 'converted' ? result.content : paste;
    return paste.endsWith('\n') ? content : content.replace(/\n$/, '');
  }

  protected readonly regionLabel = $localize`:@@convertBar.region:Convert pasted chord sheet`;
  protected readonly message = $localize`:@@convertBar.message:This looks like a chord sheet.`;
  protected readonly dialectLabel = $localize`:@@convertBar.dialect:Chords written as`;
  protected readonly englishLabel = $localize`:@@convertBar.english:English`;
  protected readonly germanLabel = $localize`:@@convertBar.german:German (H, B = B♭)`;
  protected readonly convertLabel = $localize`:@@convertBar.convert:Convert`;
  protected readonly keepLabel = $localize`:@@convertBar.keep:Keep as pasted`;
}
