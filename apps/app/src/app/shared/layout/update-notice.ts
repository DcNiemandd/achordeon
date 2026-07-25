// Update affordance — Epic 11 ▸ update strategy
// Spec: PRD-INFRASTRUCTURE.md §11 (D5), ADR-0007

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import { AppUpdate } from './app-update';
import { Fullscreen } from './fullscreen';

/**
 * The whole of "a newer version exists", in three tempers (see `AppUpdate`).
 *
 * `available` is a **bar, not a dialog, and dismissible** — a routine deploy is
 * not an emergency, and the reload it offers would throw away the moment if the
 * user is mid-song. It also stands aside while the chrome is hidden: performing
 * fullscreen is exactly when nothing may cover the lyrics, and the offer returns
 * with the bars on the next pointer move.
 *
 * `required` and `broken` are modal and have no close button, because dismissing
 * them leaves the user staring at data the app cannot read (ADR-0007) or a cache
 * that cannot serve the app. They show while performing too: something already
 * failed, and pretending otherwise is worse than interrupting.
 */
@Component({
  selector: 'app-update-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog],
  template: `
    @if (blocking() !== null) {
      <!-- No (closed) handler: this one is not closeable, and a dialog does not
           get to unmount itself. -->
      <app-dialog [title]="blockingTitle()" data-testid="update-required">
        <p class="body">{{ blockingBody() }}</p>
        <button
          appButton
          dialog-actions
          type="button"
          variant="primary"
          [disabled]="update.isBusy()"
          data-testid="update-now"
          (click)="update.activate()"
        >
          {{ update.isBusy() ? updatingLabel : updateLabel }}
        </button>
      </app-dialog>
    } @else if (isOffered()) {
      <div class="bar" role="status" data-testid="update-available">
        <span class="text">{{ availableBody }}</span>
        <button
          appButton
          type="button"
          variant="primary"
          [disabled]="update.isBusy()"
          data-testid="update-reload"
          (click)="update.activate()"
        >
          {{ reloadLabel }}
        </button>
        <button
          appButton
          type="button"
          variant="ghost"
          data-testid="update-later"
          (click)="update.dismiss()"
        >
          {{ laterLabel }}
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .bar {
      position: fixed;
      z-index: 20;
      inset-block-end: var(--space-3);
      inset-inline: var(--space-3);
      margin-inline: auto;
      inline-size: fit-content;
      max-inline-size: calc(100% - var(--space-4));
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-overlay);
      box-shadow: var(--shadow-2);
      /* Above the bottom bar's safe area on iOS, not under the home indicator. */
      margin-block-end: env(safe-area-inset-bottom, 0);
    }

    .text {
      min-inline-size: 0;
    }

    .body {
      margin: 0;
    }
  `,
})
export class UpdateNotice {
  protected readonly update = inject(AppUpdate);
  private readonly fullscreen = inject(Fullscreen);

  /** The two prompts that insist, or `null` when neither applies. */
  protected readonly blocking = computed(() => {
    const prompt = this.update.prompt();
    return prompt === 'available' ? null : prompt;
  });

  /** The gentle one, and only while there is chrome to sit beside. */
  protected readonly isOffered = computed(
    () =>
      this.update.prompt() === 'available' && this.fullscreen.isChromeVisible(),
  );

  protected readonly blockingTitle = computed(() =>
    this.blocking() === 'broken' ? this.brokenTitle : this.requiredTitle,
  );

  protected readonly blockingBody = computed(() =>
    this.blocking() === 'broken' ? this.brokenBody : this.requiredBody,
  );

  protected readonly availableBody = $localize`:@@update.available:A new version of Achordeon is ready.`;
  protected readonly reloadLabel = $localize`:@@update.reload:Reload`;
  protected readonly laterLabel = $localize`:@@update.later:Later`;
  protected readonly updateLabel = $localize`:@@update.update:Update now`;
  protected readonly updatingLabel = $localize`:@@update.updating:Updating…`;
  protected readonly requiredTitle = $localize`:@@update.required.title:Update required`;
  protected readonly requiredBody = $localize`:@@update.required.body:This data was written by a newer version of Achordeon. Update the app to read it — nothing has been changed in the meantime.`;
  protected readonly brokenTitle = $localize`:@@update.broken.title:Achordeon needs a reload`;
  protected readonly brokenBody = $localize`:@@update.broken.body:The offline cache could not be repaired. Reloading rebuilds it; your songs are stored separately and are not affected.`;
}
