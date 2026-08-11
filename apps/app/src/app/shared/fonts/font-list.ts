// The font library, as a list — Spec: PRD-RENDERING §4.10, ADR-0016, ADR-0017
//
// The settings page's whole view of what this device can set a song in. The
// pickers offer the same families; this is where one is added, read about and
// removed.
//
// **A preview loads when its row comes into view.** Four families were fine to
// fetch on open; a library is not, and a quarter of a megabyte per face that
// nobody has scrolled to is a page of nothing but downloads. The fallback stack
// covers the gap, `FontLoader`'s in-flight map makes a repeated ask free, and its
// epoch signal redraws the row when the face lands.

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { FontFamily } from '@achordeon/shared/render-core';
import { FontLibrary, FontLoader } from '@achordeon/shared/data-access';
import { Button, Dialog, Icon } from '../../primitives';
import { AddFontDialog } from './add-font-dialog';

/** A family awaiting the answer to "and what does deleting it cost?". */
interface PendingRemoval {
  readonly family: FontFamily;
  readonly users: number;
}

@Component({
  selector: 'app-font-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AddFontDialog, Button, Dialog, Icon],
  template: `
    <ul class="list" data-testid="font-list">
      @for (family of families(); track family.id) {
        <li class="row" [attr.data-testid]="'font-' + family.id">
          <div class="what">
            <!-- The name drawn in the face it names. A label can only *say*
                 what letters look like, which is the one thing a name cannot
                 do. -->
            <span
              class="preview"
              [style.font-family]="stack(family)"
              [attr.data-font]="family.id"
              >{{ family.label }}</span
            >
            <span class="meta">{{ faceSummary(family) }}</span>
          </div>

          @if (isCustom(family)) {
            <button
              appButton
              type="button"
              variant="ghost"
              [isIconOnly]="true"
              [attr.aria-label]="removeLabel(family)"
              [attr.data-testid]="'remove-' + family.id"
              (click)="ask(family)"
            >
              <app-icon name="delete" />
            </button>
          } @else {
            <span class="badge">{{ bundledLabel }}</span>
          }
        </li>
      }
    </ul>

    <button
      appButton
      variant="secondary"
      data-testid="font-add"
      (click)="isAdding.set(true)"
    >
      {{ addLabel }}
    </button>

    @if (isAdding()) {
      <app-add-font-dialog (closed)="isAdding.set(false)" />
    }

    @if (pending(); as removal) {
      <app-dialog
        [title]="removeTitle"
        data-testid="font-remove-dialog"
        (closed)="pending.set(null)"
      >
        <!-- Never a veto, only a price. The id stays in every song that named
             it, so those pages come back the moment the family is added again —
             which is what makes the slug id worth its collision risk. -->
        <p>{{ removeBody(removal) }}</p>

        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="font-remove-cancel"
          (click)="pending.set(null)"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="danger"
          data-testid="font-remove-confirm"
          (click)="remove(removal.family)"
        >
          {{ removeConfirmLabel }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0 0 var(--space-2);
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) 0;
      border-block-end: 1px solid var(--border);
    }

    .what {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
      flex: 1;
    }

    /* Bigger than the surrounding UI, because a face is not recognisable at
       label size — recognising it is the entire job of this line. */
    .preview {
      font-size: var(--text-lg);
      line-height: var(--leading-tight);
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta,
    .badge {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }
  `,
})
export class FontList {
  private readonly library = inject(FontLibrary);
  private readonly fonts = inject(FontLoader);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly families = computed(() => this.fonts.catalog.list());
  protected readonly isAdding = signal(false);
  protected readonly pending = signal<PendingRemoval | null>(null);

  protected readonly addLabel = $localize`:@@fonts.add:Add a font…`;
  protected readonly bundledLabel = $localize`:@@fonts.bundled:Built in`;
  protected readonly removeTitle = $localize`:@@fonts.removeTitle:Remove this font?`;
  protected readonly removeConfirmLabel = $localize`:@@fonts.removeConfirm:Remove`;
  protected readonly cancelLabel = $localize`:@@fonts.cancel:Cancel`;

  constructor() {
    const observer = makeObserver((id) =>
      // One line at one weight: a bold nobody is looking at is a quarter of a
      // megabyte spent on a preview.
      this.fonts.ensure([id], ['normal']),
    );
    if (observer) {
      // After render, and re-run when the library changes: the rows under watch
      // are whatever is on screen now, not whatever was there at construction.
      afterRenderEffect(() => {
        this.families();
        const host = this.host.nativeElement as HTMLElement;
        host
          .querySelectorAll('[data-font]')
          .forEach((node) => observer.observe(node));
      });
    }
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }

  protected isCustom(family: FontFamily): boolean {
    return family.category === 'custom';
  }

  protected stack(family: FontFamily): string {
    // Read so the row redraws when its face lands; the name itself is enough to
    // make the browser use whatever is registered under it by then.
    this.fonts.epoch();
    return `'${family.family}', ${family.fallback}`;
  }

  protected faceSummary(family: FontFamily): string {
    const count = Object.keys(family.faces).length;
    return $localize`:@@fonts.faces:${count}:count: of 4 styles`;
  }

  protected removeLabel(family: FontFamily): string {
    return $localize`:@@fonts.removeOne:Remove ${family.label}:font:`;
  }

  protected removeBody(removal: PendingRemoval): string {
    return removal.users === 0
      ? $localize`:@@fonts.removeNone:Nothing is set in ${removal.family.label}:font:. You can add it again at any time.`
      : $localize`:@@fonts.removeSome:${removal.users}:count: of your songs and songbooks are set in ${removal.family.label}:font:. They will go back to the default font, and come back to this one if you add it again.`;
  }

  protected async ask(family: FontFamily): Promise<void> {
    this.pending.set({
      family,
      users: await this.library.countUsers(family.id),
    });
  }

  protected async remove(family: FontFamily): Promise<void> {
    this.pending.set(null);
    await this.library.remove(family.id);
  }
}

/**
 * Fetch a row's face the first time it is scrolled to (§4.10, Epic 11's lazy
 * split).
 *
 * Absent an `IntersectionObserver` — jsdom, an old engine — nothing is fetched
 * and every row draws in its fallback, which is the honest degradation for a
 * decoration.
 */
function makeObserver(
  load: (id: string) => Promise<void>,
): IntersectionObserver | null {
  const Observer = (
    globalThis as { IntersectionObserver?: typeof IntersectionObserver }
  ).IntersectionObserver;
  if (!Observer) return null;

  const observer = new Observer((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.getAttribute('data-font');
      if (id) void load(id);
      observer.unobserve(entry.target);
    }
  });
  return observer;
}
