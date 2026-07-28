// All songs sorting dialog — the order it goes to the stage in
// Spec: CONTEXT.md §Songbook (All songs — a read-only *order*), §Stage, §Account;
// PRD-UI-SHELL.md §3 (controlled component), ADR-0004 (the account row syncs).

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  DEFAULT_ALL_SONGS_ORDER,
  type AllSongsOrder,
} from '@achordeon/shared/domain';
import { Button, Dialog } from '../primitives';

/**
 * Ask what order All songs is performed in, and save the answer.
 *
 * A stored songbook's order IS its content — you arranged the slots, and it plays
 * as arranged. All songs has no arrangement to protect, so its order has to be
 * *described* instead: an axis, a direction, and whether favourites float.
 *
 * **It lives in the Stage picker, next to the row it orders**, because that is the
 * only place its answer shows: the setlist. It was briefly a gear on the Songbooks
 * row, where it governed nothing you could see — the row does not open, and the
 * download dialog asks about order itself — and a setting with no visible effect on
 * the screen it sits on is a setting nobody can check.
 *
 * A **controlled component** (§3): the saved order in, the new one out. It holds a
 * draft while the dialog is open, because a dialog with a Save button must be
 * abandonable — writing each dropdown straight through would make Cancel a lie.
 */
@Component({
  selector: 'app-all-songs-order-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog],
  template: `
    <app-dialog
      [title]="title"
      mode="viewport"
      data-testid="all-songs-order-dialog"
      (closed)="closed.emit()"
    >
      <p class="lead">{{ lead }}</p>

      <div class="group" role="group" [attr.aria-label]="title">
        <label class="row">
          <span class="name">{{ orderLabel }}</span>
          <select
            class="control"
            [value]="draft.sort"
            data-testid="all-songs-order-axis"
            (change)="patch({ sort: axis($event) })"
          >
            <option value="name">{{ byNameLabel }}</option>
            <option value="created">{{ byCreatedLabel }}</option>
            <option value="changed">{{ byChangedLabel }}</option>
          </select>
        </label>

        <label class="row">
          <span class="name">{{ directionLabel }}</span>
          <select
            class="control"
            [value]="draft.dir"
            data-testid="all-songs-order-dir"
            (change)="patch({ dir: dir($event) })"
          >
            <option value="asc">{{ ascLabel }}</option>
            <option value="desc">{{ descLabel }}</option>
          </select>
        </label>

        <label class="row is-toggle">
          <input
            type="checkbox"
            [checked]="draft.favoritesFirst"
            data-testid="all-songs-order-favorites"
            (change)="patch({ favoritesFirst: checked($event) })"
          />
          <span class="name">{{ favoritesFirstLabel }}</span>
        </label>
      </div>

      <p class="note">{{ note }}</p>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="all-songs-order-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="all-songs-order-save"
        (click)="saved.emit(draft)"
      >
        {{ saveLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .lead {
      margin: 0 0 var(--space-3);
      color: var(--text-muted);
      font-size: var(--text-sm);
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--space-3);
    }

    .row.is-toggle {
      grid-template-columns: auto 1fr;
      justify-items: start;
    }

    .control {
      min-inline-size: 8rem;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    .note {
      margin: var(--space-3) 0 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class AllSongsOrderDialog {
  /** The saved order the dialog opens on. */
  readonly order = input<AllSongsOrder>(DEFAULT_ALL_SONGS_ORDER);

  readonly closed = output<void>();
  readonly saved = output<AllSongsOrder>();

  /**
   * The order as edited so far.
   *
   * A plain field seeded from the input rather than a signal kept in step with it:
   * the dialog is created when it opens and destroyed when it closes, so the input
   * is read exactly once and a later change to the saved order — which can only
   * come from another device mid-edit — must not reach under the dropdowns of
   * someone who is choosing.
   */
  protected draft: AllSongsOrder = { ...this.order() };

  protected patch(change: Partial<AllSongsOrder>): void {
    this.draft = { ...this.draft, ...change };
  }

  protected axis(event: Event): AllSongsOrder['sort'] {
    return (event.target as HTMLSelectElement).value as AllSongsOrder['sort'];
  }

  protected dir(event: Event): AllSongsOrder['dir'] {
    return (event.target as HTMLSelectElement).value as AllSongsOrder['dir'];
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected readonly title = $localize`:@@allSongsOrder.title:All songs sorting`;
  protected readonly lead = $localize`:@@allSongsOrder.lead:All songs has no order of its own, so choose the order it is performed in.`;
  protected readonly note = $localize`:@@allSongsOrder.note:Saved to your account, so it applies on every device you sign in on.`;
  protected readonly orderLabel = $localize`:@@allSongsOrder.order:Order by`;
  protected readonly directionLabel = $localize`:@@allSongsOrder.direction:Direction`;
  protected readonly byNameLabel = $localize`:@@allSongsOrder.byName:Name`;
  protected readonly byCreatedLabel = $localize`:@@allSongsOrder.byCreated:Date created`;
  protected readonly byChangedLabel = $localize`:@@allSongsOrder.byChanged:Date changed`;
  protected readonly ascLabel = $localize`:@@allSongsOrder.asc:Ascending`;
  protected readonly descLabel = $localize`:@@allSongsOrder.desc:Descending`;
  protected readonly favoritesFirstLabel = $localize`:@@allSongsOrder.favoritesFirst:Favorites first`;
  protected readonly cancelLabel = $localize`:@@allSongsOrder.cancel:Cancel`;
  protected readonly saveLabel = $localize`:@@allSongsOrder.save:Save`;
}
