// Add a font — ADR-0016 (a font is acquired, not referenced)
// Spec: PRD-RENDERING §4.10, CONTEXT.md §Custom font
//
// One dialog, three ways in, one path out. A searched name, a picked file and a
// pasted link differ only in where the bytes come from: all three end at the
// same parse, which is what decides whether the font can be used at all.
//
// **Three parts, each committing on its own.** A result row is its own submit, a
// picked file is added the moment it is chosen, and the link has a button beside
// it. So the footer holds only *Close* — there is no pending decision for an OK
// button to confirm, and a primary action down there would have belonged to
// whichever of the three the user was not looking at. The separators used to be
// the word "or", which reads as a step in a sequence; a rule says "another way
// to the same place" and says it without a word.
//
// **Search is the front door.** Pasting the embed link works and is still here,
// but it asks someone to go to another site, pick a font there and bring a URL
// back — for a catalogue the app already carries an index of. The index is
// warmed when the dialog opens: 231 KB, once a session, on no render's path.
//
// **A result is a name and nothing else.** Drawing each one in its own face is
// what a font picker wants to do and is exactly what this cannot afford — the
// catalogue is some 1800 families and jsDelivr serves whole TTFs, 100-400 KB
// apiece, so a scroll would cost megabytes. Previews live on the installed
// list, where the bytes are already on the device.
//
// **It writes device state, and that is why it holds no output for the caller to
// apply.** A font belongs to the machine, not to the song being edited — which
// is exactly why the same dialog opens from a song's settings and from the
// settings page, and why closing it changes nothing about the song.

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  output,
  signal,
} from '@angular/core';
import type { FontFamily } from '@achordeon/shared/render-core';
import {
  FontFetcher,
  FontLibrary,
  type FontCandidate,
} from '@achordeon/shared/data-access';
import { Button, Dialog, Field } from '../../primitives';
import { faceSummary } from './face-summary';

/** Which of the three ways in a message belongs under. */
type Way = 'search' | 'file' | 'link';

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
      <!-- One thing is being fetched, so the three ways are gone while it is:
           the same shape the download dialog takes once a format is picked. It
           replaces them rather than disabling them, because a disabled form is
           a form that still invites reading, and there is nothing here to
           reconsider until the answer arrives. A refusal puts the ways back
           with the reason under whichever one earned it. -->
      @if (isBusy()) {
        <div class="getting" data-testid="add-font-getting">
          <span class="spinner" aria-hidden="true"></span>
          <span>{{ busyLabel }}</span>
        </div>
      } @else {
        <div class="ways">
          <p class="lead">{{ lead }}</p>

          <section class="way">
            <label class="name" for="add-font-search">{{ searchLabel }}</label>
            <input
              appField
              #search
              id="add-font-search"
              type="search"
              [value]="query()"
              [placeholder]="searchPlaceholder"
              data-testid="add-font-search"
              (input)="find(search.value)"
            />

            @if (indexError(); as message) {
              <p class="error" role="alert" data-testid="add-font-index-error">
                {{ message }}
              </p>
            } @else if (results(); as found) {
              @if (found.length > 0) {
                <ul class="results" data-testid="add-font-results">
                  @for (family of found; track family.key) {
                    <li>
                      <!-- The row *is* this part's submit: there is one thing
                           to do with a result, and a button beside it would
                           only ask which of two identical actions was meant. -->
                      <button
                        type="button"
                        class="result"
                        [attr.data-testid]="'add-font-result-' + family.key"
                        (click)="fromIndex(family)"
                      >
                        <span>{{ family.label }}</span>
                        <!-- What adding it will actually give you, in the words
                             the library list will use afterwards. A family
                             offering nine weights on the Google Fonts site
                             installs as one face when the repo ships it as a
                             single variable file; that belongs here, before the
                             click, not only after it. -->
                        <span class="faces">{{ facesFor(family) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              } @else if (query().trim().length >= MIN_QUERY) {
                <p class="hint" data-testid="add-font-no-results">
                  {{ noResultsLabel }}
                </p>
              }
            }

            @if (errorFor('search'); as message) {
              <p class="error" role="alert" data-testid="add-font-error">
                {{ message }}
              </p>
            }
          </section>

          <!-- The file: it needs no network, no allow-list and no explanation,
               and it is the path that always works. Its submit is the picker —
               the font is added the moment one is chosen. -->
          <section class="way">
            <label class="name" for="add-font-file">{{ fileLabel }}</label>
            <input
              #file
              id="add-font-file"
              type="file"
              accept=".ttf,font/ttf"
              data-testid="add-font-file"
              (change)="fromFile(file.files)"
            />
            <span class="hint">{{ fileHint }}</span>

            @if (errorFor('file'); as message) {
              <p class="error" role="alert" data-testid="add-font-error">
                {{ message }}
              </p>
            }
          </section>

          <section class="way">
            <label class="name" for="add-font-link">{{ linkLabel }}</label>
            <div class="inline">
              <input
                appField
                #link
                id="add-font-link"
                type="url"
                [value]="url()"
                [placeholder]="linkPlaceholder"
                data-testid="add-font-url"
                (input)="url.set(link.value)"
              />
              <!-- Disabled only by its own field being empty. It used to also
                   read the shared busy flag, which meant picking a search
                   result greyed out a button three sections away that had
                   nothing to do with it. -->
              <button
                appButton
                type="button"
                variant="secondary"
                data-testid="add-font-fetch"
                [disabled]="url().trim().length === 0"
                (click)="fromUrl()"
              >
                {{ fetchLabel }}
              </button>
            </div>
            <span class="hint">{{ linkHint }}</span>

            @if (errorFor('link'); as message) {
              <!-- Refused here, with the user watching, and beside the field
                   that caused it. The alternative is a PDF missing a face weeks
                   later, which is the one failure a document app cannot have. -->
              <p class="error" role="alert" data-testid="add-font-error">
                {{ message }}
              </p>
            }
          </section>
        </div>
      }

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="add-font-close"
        (click)="closed.emit()"
      >
        {{ closeLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .ways {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    /* Three ways in, drawn as three. A rule between them says "another way to
       do the same thing" without a word — where the "or" it replaces read as a
       step in a sequence, which is the one thing these are not. */
    .way {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .way + .way {
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border);
    }

    .inline {
      display: flex;
      gap: var(--space-1);
    }

    .inline > input {
      flex: 1;
      min-inline-size: 0;
    }

    .lead,
    .hint {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .name {
      color: var(--text);
    }

    /* Capped and scrolled rather than sized to the answer: a dialog that grew
       and shrank under every keystroke would move the field being typed in. */
    .results {
      display: flex;
      flex-direction: column;
      max-block-size: 12rem;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      list-style: none;
    }

    .result {
      display: flex;
      flex-direction: column;
      inline-size: 100%;
      padding: var(--space-1) var(--space-2);
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    /* The count wraps rather than truncating: the variable-font sentence is the
       one row where the second line is the whole point of reading it. */
    .faces {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .result:hover:not(:disabled),
    .result:focus-visible {
      background: var(--surface-hover);
    }

    .error {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--danger);
    }

    /* What stands where the three ways were while one of them is fetching. */
    .getting {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      font-size: var(--text-sm);
      color: var(--text);
    }

    .spinner {
      inline-size: 18px;
      block-size: 18px;
      flex: none;
      border-radius: 50%;
      border: 2px solid var(--border-strong);
      border-block-start-color: var(--brand);
      animation: add-font-spin 0.7s linear infinite;
    }

    @keyframes add-font-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly url = signal('');
  /**
   * The refusal, and which of the three ways in earned it.
   *
   * Scoped to a way rather than to the dialog: the three are independent, and a
   * message under the last of them saying "only .ttf files" would be describing
   * a file the user picked two sections higher up.
   */
  private readonly failure = signal<{ way: Way; message: string } | null>(null);
  protected readonly isBusy = signal(false);

  /** Short of this, a query matches most of the catalogue and means nothing. */
  protected readonly MIN_QUERY = 2;
  protected readonly query = signal('');
  protected readonly results = signal<readonly FontCandidate[]>([]);
  protected readonly indexError = signal<string | null>(null);

  /**
   * Where the caret belongs the next time the form is on screen.
   *
   * An object rather than a bare `Way` so that setting it twice running is two
   * changes: two link failures in a row must both put focus back, and a signal
   * holding `'link'` again would not have fired.
   *
   * This is what the `appAutofocus` directive used to do, and it stopped being
   * enough the moment the form could *return*: after a link is refused, the
   * field to fix is the link, not the search box the directive would have
   * grabbed on the way back in.
   */
  private readonly focusOn = signal<{ way: Way }>({ way: 'search' });

  constructor() {
    // Warmed on open rather than on the first keystroke: it is one fetch either
    // way, and doing it here means the first thing typed is answered at once.
    void this.fetcher.open().catch((error: unknown) => {
      this.indexError.set(
        error instanceof Error && error.message
          ? error.message
          : $localize`:@@addFont.indexFailed:The list of fonts could not be loaded.`,
      );
    });

    // After render, because the field is created by the same pass that removes
    // the spinner and `focus()` on a detached node does nothing — silently.
    afterRenderEffect(() => {
      if (this.isBusy()) return;
      const { way } = this.focusOn();
      this.host.nativeElement
        .querySelector<HTMLElement>(`#add-font-${way}`)
        ?.focus();
    });
  }

  protected readonly title = $localize`:@@addFont.title:Add a font`;
  protected readonly lead = $localize`:@@addFont.lead:TrueType (.ttf) only, and one file is one style — add the bold as a second file. A style you do not add is borrowed from another font.`;
  protected readonly searchLabel = $localize`:@@addFont.search:From Google Fonts`;
  protected readonly searchPlaceholder = $localize`:@@addFont.searchPlaceholder:Type a font's name`;
  protected readonly noResultsLabel = $localize`:@@addFont.noResults:No font of that name.`;
  protected readonly fileLabel = $localize`:@@addFont.file:From a file`;
  protected readonly fileHint = $localize`:@@addFont.fileHint:Added as soon as you choose one.`;
  protected readonly linkLabel = $localize`:@@addFont.link:From a link`;
  protected readonly linkPlaceholder = `https://fonts.googleapis.com/css2?family=Lora`;
  protected readonly linkHint = $localize`:@@addFont.linkHint:Paste the embed link Google Fonts gives you, or a direct .ttf address on jsDelivr or raw.githubusercontent.com.`;
  protected readonly fetchLabel = $localize`:@@addFont.fetch:Get the font`;
  protected readonly busyLabel = $localize`:@@addFont.fetching:Getting the font…`;
  // "Close", not "Cancel": there is nothing pending to cancel. Each way in
  // commits on its own, so the footer is a way out and not a decision.
  protected readonly closeLabel = $localize`:@@addFont.close:Close`;

  /**
   * Search as it is typed. No debounce: the index is already in memory by the
   * time anyone has typed two letters, and filtering 1800 names costs nothing.
   *
   * The answer is checked against the query it was asked for, because two
   * keystrokes can be in flight while the index is still arriving and the
   * slower one must not overwrite the newer.
   */
  protected async find(raw: string): Promise<void> {
    this.query.set(raw);
    if (raw.trim().length < this.MIN_QUERY) {
      this.results.set([]);
      return;
    }
    const found = await this.fetcher.search(raw).catch(() => []);
    if (this.query() === raw) this.results.set(found);
  }

  /** What installing this will produce — the library list's own sentence. */
  protected facesFor(family: FontCandidate): string {
    return faceSummary(family.faces, family.isVariable);
  }

  /** The refusal this way earned, if the last one was its. */
  protected errorFor(way: Way): string | null {
    const failure = this.failure();
    return failure?.way === way ? failure.message : null;
  }

  protected async fromIndex(family: FontCandidate): Promise<void> {
    await this.run('search', () =>
      this.fetcher.addFamily(family.key, family.label),
    );
  }

  protected async fromFile(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    await this.run('file', async () => [
      await this.library.add(await file.arrayBuffer()),
    ]);
  }

  protected async fromUrl(): Promise<void> {
    await this.run('link', () => this.fetcher.add(this.url()));
  }

  /**
   * All three paths, reporting under whichever one was used.
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
  private async run(way: Way, add: () => Promise<FontFamily[]>): Promise<void> {
    this.isBusy.set(true);
    this.failure.set(null);
    try {
      const families = await add();
      this.added.emit(families);
      this.closed.emit();
    } catch (error) {
      this.failure.set({
        way,
        message:
          error instanceof Error && error.message
            ? error.message
            : $localize`:@@addFont.failed:That font could not be added.`,
      });
      // Back to the field that has the problem in it, not to the top of a form
      // the user has to find their place in again.
      this.focusOn.set({ way });
    } finally {
      this.isBusy.set(false);
    }
  }
}
