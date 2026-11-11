// Song site dialog — plans/import-chord-sheets.md phase 6 (Q15, Q16, Q59, Q62)
//
// One input: a song's name, an artist, or a link. Enter or Search asks; typing
// never does, because every search is a request to every site (Q59). Results
// come grouped by site, each in the site's own order, and a site that failed
// says so in its own group while the rest still show.
//
// Controlled: the flow holds the query and the results, so Back from the
// preview finds them exactly as they were (Q18).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { Autofocus, Button, Dialog, Field, Icon } from '../../primitives';
import type {
  SongSiteFailureCode,
  SongSitePick,
  SongSiteResultGroup,
} from './song-site-model';

@Component({
  selector: 'app-song-site-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus, Button, Dialog, Field, Icon],
  template: `
    <app-dialog
      [title]="title"
      data-testid="song-site-dialog"
      (closed)="closed.emit()"
    >
      <form class="ask" (submit)="$event.preventDefault(); submit()">
        <input
          appField
          appAutofocus
          type="search"
          class="query"
          enterkeyhint="search"
          autocomplete="off"
          [attr.aria-label]="inputLabel"
          [placeholder]="placeholder"
          [value]="draft()"
          (input)="draft.set(value($event))"
          data-testid="song-site-query"
        />
        <button
          appButton
          type="submit"
          variant="primary"
          [disabled]="isBusy()"
          data-testid="song-site-search"
        >
          <app-icon name="search" />
          {{ searchLabel }}
        </button>
      </form>
      @if (linkHint()) {
        <p class="hint">{{ linkHint() }}</p>
      }

      <!-- The one part that scrolls: the title, the input and the footer stay
           where they are however long the list gets. -->
      <div class="answer">
        @if (isBusy()) {
          <div class="busy" data-testid="song-site-busy">
            <span class="spinner" aria-hidden="true"></span>
            <span>{{ busyLabel }}</span>
          </div>
        } @else if (failureText()) {
          <p class="failure" role="alert" data-testid="song-site-failure">
            {{ failureText() }}
          </p>
        } @else if (groups(); as groups) {
          @if (isNothingFound()) {
            <p class="empty" data-testid="song-site-empty">
              {{ nothingFound }}
            </p>
          }
          @for (group of groups; track group.site) {
            @if (group.notice || group.results.length > 0) {
              <section class="group" data-testid="song-site-group">
                <h3 class="site">{{ group.siteName }}</h3>
                @if (group.notice) {
                  <p class="notice">{{ noticeText(group) }}</p>
                }
                <ul class="results">
                  @for (result of group.results; track result.id) {
                    <li>
                      <button
                        type="button"
                        class="result"
                        data-testid="song-site-result"
                        (click)="
                          chosen.emit({ site: group.site, id: result.id })
                        "
                      >
                        <span class="song">{{ result.title }}</span>
                        @if (result.artist) {
                          <span class="artist">{{ result.artist }}</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              </section>
            }
          }
        }
      </div>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="song-site-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .ask {
      display: flex;
      gap: var(--space-2);
    }

    .query {
      flex: 1;
      min-inline-size: 0;
    }

    .hint {
      margin: var(--space-1) 0 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .busy {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      font-size: var(--text-sm);
    }

    .spinner {
      inline-size: 18px;
      block-size: 18px;
      flex: none;
      border-radius: 50%;
      border: 2px solid var(--border-strong);
      border-block-start-color: var(--brand);
      animation: song-site-spin 0.7s linear infinite;
    }

    @keyframes song-site-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }

    .failure,
    .empty,
    .notice {
      margin: var(--space-3) 0 0;
      font-size: var(--text-sm);
    }

    .failure {
      color: var(--danger, var(--text));
    }

    .notice,
    .empty {
      color: var(--text-muted);
    }

    .group {
      margin-block-start: var(--space-3);
    }

    .site {
      margin: 0 0 var(--space-1);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* Capped below the viewport, so the panel itself never has to scroll. */
    .answer {
      max-block-size: 55vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .results {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .result {
      display: flex;
      flex-direction: column;
      inline-size: 100%;
      padding: var(--space-2);
      border: 0;
      border-radius: var(--radius-sm, 6px);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .result:hover,
    .result:focus-visible {
      background: var(--surface-hover, var(--border));
    }

    .song {
      font-weight: 500;
    }

    .artist {
      color: var(--text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class SongSiteDialog {
  /** The input as last asked, restored on Back (Q18). */
  readonly query = input('');
  /** The sites' link hints, for which links can be pasted (Q15). */
  readonly urlHints = input<readonly string[]>([]);
  /** The last search's answer; null before the first one. */
  readonly groups = input<readonly SongSiteResultGroup[] | null>(null);
  readonly failure = input<SongSiteFailureCode | null>(null);
  readonly isBusy = input(false);

  readonly submitted = output<string>();
  readonly chosen = output<SongSitePick>();
  readonly closed = output<void>();

  /** What is in the box now — the flow's query until the person types. */
  protected readonly draft = linkedSignal(() => this.query());

  protected readonly linkHint = computed(() => {
    const hints = this.urlHints();
    return hints.length > 0
      ? $localize`:@@songSite.linkHint:Links from: ${hints.join(', ')}:sites:`
      : '';
  });

  protected readonly isNothingFound = computed(() => {
    const groups = this.groups();
    return (
      groups !== null &&
      groups.every((group) => !group.notice && group.results.length === 0)
    );
  });

  protected readonly failureText = computed(() => {
    switch (this.failure()) {
      case 'rate-limited':
        return $localize`:@@songSite.rateLimited:Too many searches. Try again in a few minutes.`;
      case 'unsupported-url':
        return $localize`:@@songSite.unsupportedUrl:We can't read songs from that site.`;
      case 'not-found':
        return $localize`:@@songSite.notFound:That song isn't there any more.`;
      case 'timeout':
        return $localize`:@@songSite.timeoutAny:The site took too long to answer.`;
      case 'unavailable':
        return $localize`:@@songSite.unavailableAny:The site isn't answering right now.`;
      default:
        return '';
    }
  });

  protected noticeText(group: SongSiteResultGroup): string {
    return group.notice === 'timeout'
      ? $localize`:@@songSite.timeout:${group.siteName}:site: took too long to answer.`
      : $localize`:@@songSite.unavailable:${group.siteName}:site: isn't answering right now.`;
  }

  protected submit(): void {
    this.submitted.emit(this.draft());
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected readonly title = $localize`:@@songSite.title:Find a song`;
  protected readonly inputLabel = $localize`:@@songSite.inputLabel:Song, artist or link`;
  protected readonly placeholder = $localize`:@@songSite.placeholder:Song name, artist or link`;
  protected readonly searchLabel = $localize`:@@songSite.search:Search`;
  protected readonly busyLabel = $localize`:@@songSite.busy:Searching…`;
  protected readonly nothingFound = $localize`:@@songSite.nothingFound:Nothing found.`;
  protected readonly cancelLabel = $localize`:@@songSite.cancel:Cancel`;
}
