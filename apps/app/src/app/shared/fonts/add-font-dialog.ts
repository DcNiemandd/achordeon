// Add a font — ADR-0016 (a font is acquired, not referenced)
// Spec: PRD-RENDERING §4.10, CONTEXT.md §Custom font
//
// One dialog, two ways in, one path out. A picked file and a pasted link differ
// only in where the bytes come from: both end at the same parse, which is what
// decides whether the font can be used at all.
//
// **It writes device state, and that is why it holds no output for the caller to
// apply.** A font belongs to the machine, not to the song being edited — which
// is exactly why the same dialog opens from a song's settings and from the
// settings page, and why closing it changes nothing about the song.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import type { FontFamily } from '@achordeon/shared/render-core';
import { FontFetcher, FontLibrary } from '@achordeon/shared/data-access';
import { Button, Dialog, Field } from '../../primitives';

@Component({
  selector: 'app-add-font-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog, Button, Field],
  template: `
    <app-dialog
      [title]="title"
      data-testid="add-font-dialog"
      (closed)="closed.emit()"
    >
      <div class="form">
        <p class="lead">{{ lead }}</p>

        <!-- The file, first: it needs no network, no allow-list and no
             explanation, and it is the path that always works. -->
        <label class="stack">
          <span class="name">{{ fileLabel }}</span>
          <input
            #file
            type="file"
            accept=".ttf,font/ttf"
            data-testid="add-font-file"
            (change)="fromFile(file.files)"
          />
        </label>

        <p class="or">{{ orLabel }}</p>

        <label class="stack">
          <span class="name">{{ linkLabel }}</span>
          <input
            appField
            #link
            type="url"
            [value]="url()"
            [placeholder]="linkPlaceholder"
            data-testid="add-font-url"
            (input)="url.set(link.value)"
          />
          <span class="hint">{{ linkHint }}</span>
        </label>

        @if (error(); as message) {
          <!-- Refused here, with the user watching. The alternative is a PDF
               missing a face weeks later, which is the one failure a document
               app cannot have. -->
          <p class="error" role="alert" data-testid="add-font-error">
            {{ message }}
          </p>
        }
      </div>

      <button
        dialog-actions
        appButton
        type="button"
        variant="ghost"
        data-testid="add-font-close"
        (click)="closed.emit()"
      >
        {{ closeLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="add-font-fetch"
        [disabled]="isBusy() || url().trim().length === 0"
        (click)="fromUrl()"
      >
        {{ isBusy() ? busyLabel : fetchLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .lead,
    .hint,
    .or {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .or {
      text-align: center;
    }

    .name {
      color: var(--text);
    }

    .error {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--danger);
    }
  `,
})
export class AddFontDialog {
  /** Closed by the caller. Nothing is handed back: the library is the result. */
  readonly closed = output<void>();
  /** The families that arrived, so a picker can select one straight away. */
  readonly added = output<FontFamily[]>();

  private readonly library = inject(FontLibrary);
  private readonly fetcher = inject(FontFetcher);

  protected readonly url = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly isBusy = signal(false);

  protected readonly title = $localize`:@@addFont.title:Add a font`;
  protected readonly lead = $localize`:@@addFont.lead:TrueType (.ttf) only, and one file is one style — add the bold as a second file. A style you do not add is borrowed from another font.`;
  protected readonly fileLabel = $localize`:@@addFont.file:From a file`;
  protected readonly orLabel = $localize`:@@addFont.or:or`;
  protected readonly linkLabel = $localize`:@@addFont.link:From a link`;
  protected readonly linkPlaceholder = `https://fonts.googleapis.com/css2?family=Lora`;
  protected readonly linkHint = $localize`:@@addFont.linkHint:Paste the embed link Google Fonts gives you, or a direct .ttf address on jsDelivr or raw.githubusercontent.com.`;
  protected readonly fetchLabel = $localize`:@@addFont.fetch:Get the font`;
  protected readonly busyLabel = $localize`:@@addFont.fetching:Getting…`;
  protected readonly closeLabel = $localize`:@@addFont.close:Cancel`;

  protected async fromFile(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    await this.run(async () => [
      await this.library.add(await file.arrayBuffer()),
    ]);
  }

  protected async fromUrl(): Promise<void> {
    await this.run(() => this.fetcher.add(this.url()));
  }

  /**
   * Both paths, with one place that reports.
   *
   * Every refusal downstream carries its own reason — "OpenType/CFF outlines",
   * "only .ttf files", "no font called Xyz" — and the reason is the whole value
   * of refusing at add-time, so it is shown rather than replaced with a generic.
   *
   * **Success closes it**, and the confirmation is the list behind: the font is
   * on it, in its own letters. A dialog that stayed open with a line of text in
   * it left the user to work out whether anything had happened, and the one
   * thing that would have told them was already on screen behind the dialog.
   */
  private async run(add: () => Promise<FontFamily[]>): Promise<void> {
    this.isBusy.set(true);
    this.error.set(null);
    try {
      const families = await add();
      this.added.emit(families);
      this.closed.emit();
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message
          ? error.message
          : $localize`:@@addFont.failed:That font could not be added.`,
      );
    } finally {
      this.isBusy.set(false);
    }
  }
}
