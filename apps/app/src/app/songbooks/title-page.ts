// Songbook title page (placeholder) — Epic 6 ▸ subtask 1
// Spec: CONTEXT.md §Songbook (title-page fields); Epic 7 owns the real render
//
// **Text, deliberately.** A songbook's title page is a rendered page — Epic 7's
// songbook PDF draws it, with the page size, margins and fonts the download
// options choose. Drawing a second, prettier version here would be a guess at
// that layout that nobody would think to delete once the real one lands. So
// this shows the fields, plainly, and Epic 7 replaces the component wholesale.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'app-title-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" data-testid="title-page">
      <p class="pending">{{ pendingNote }}</p>

      <h2 class="title">{{ title() || untitled }}</h2>
      @if (subtitle()) {
        <p class="subtitle">{{ subtitle() }}</p>
      }
      @if (author()) {
        <p class="author">{{ author() }}</p>
      }
      <p class="count">{{ countLabel() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      block-size: 100%;
      padding: var(--space-6);
      text-align: center;
    }

    /* Says what this is, so a plain stack of text is not mistaken for the
       finished article. */
    .pending {
      margin: 0 0 var(--space-4);
      font-size: var(--text-xs);
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: 600;
      color: var(--text);
    }

    .subtitle {
      margin: 0;
      font-size: var(--text-md);
      color: var(--text-muted);
    }

    .author {
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .count {
      margin: var(--space-4) 0 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }
  `,
})
export class TitlePage {
  readonly title = input('');
  readonly subtitle = input('');
  readonly author = input('');
  readonly count = input(0);

  protected readonly untitled = $localize`:@@titlePage.untitled:Untitled songbook`;
  protected readonly pendingNote = $localize`:@@titlePage.pending:Title page — preview`;

  protected readonly countLabel = computed(
    () => $localize`:@@songbooks.count:${this.count()}:count: songs`,
  );
}
