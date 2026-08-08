// Where anything that arrives is met — plan §4 / §7
//
// A shell file, not a component under the presenter rule: wiring the app's
// services to the frame is exactly its job (PRD-UI-SHELL.md §3), and it is the
// only place in the app that may both inject `ImportInbox` and mount the panels
// from `app/shared` — a `*.page.ts` or a `*.component.ts` may not inject the one,
// and `app/shared` may not import it at all.
//
// It owns three things and nothing else: the window-level drop, the link's
// fragment, and the dialogs the inbox drives.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ImportInbox } from '@achordeon/shared/data-access';
import { ImportDropOverlay, ImportInboxPanel } from './shared/transfer';
import type { ImportChoice, ImportPreview } from './shared/transfer';

@Component({
  selector: 'app-import-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImportDropOverlay, ImportInboxPanel],
  template: `
    <app-import-drop-overlay (dropped)="inbox.offer($event)" />
    <app-import-inbox-panel
      [preview]="preview()"
      [error]="inbox.failure()"
      [remaining]="inbox.remaining()"
      (confirmed)="confirm($event)"
      (skipped)="inbox.skip()"
      (cancelledAll)="inbox.cancelAll()"
    />
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class ImportHost {
  protected readonly inbox = inject(ImportInbox);

  /**
   * The plan as the dialog's own vocabulary.
   *
   * `ImportPreview` is declared in `app/shared/transfer`, not imported from
   * data-access — the same trick `ExplorerSort` plays with the store's `SortKey`.
   * The mapping is a presenter's job everywhere else in the app, and this is the
   * shell standing in for one.
   */
  protected readonly preview = computed<ImportPreview | null>(() => {
    const item = this.inbox.item();
    if (!item) return null;
    return {
      songCount: item.plan.songs.length,
      songbookCount: item.plan.songbooks.length,
      conflicts: item.plan.conflicts.map((conflict) => ({ ...conflict })),
      hasUnknownSettings: item.hasUnknownSettings,
      flaggedSongs: item.flaggedSongs,
    };
  });

  constructor() {
    /**
     * A link's payload arrives in two shapes, and the second is the one that gets
     * missed:
     *
     * - **Fresh load** — the link is tapped and the app boots with the fragment in
     *   the URL.
     * - **Already running** — the PWA is open and the link is routed into the
     *   existing window, or the URL is pasted into the address bar. That is a
     *   *navigation carrying a fragment*, not a boot.
     *
     * A listener on router events catches both. A one-shot read of
     * `location.hash` at startup catches only the first, and the second is the one
     * that gets reported as "sometimes it does nothing".
     */
    const router = inject(Router);
    router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.readFragment());

    this.acceptLaunchedFiles();
  }

  /**
   * A double-clicked `.achordeon` file, where the OS knows to send it here.
   *
   * The manifest's `file_handlers` entry is only half of it: registering the type
   * makes the OS launch the installed app, and this is what actually receives the
   * file it was launched with. Chromium desktop only — `launchQueue` is absent
   * everywhere else, which is why this is a feature test and not a capability
   * check, and harmless where it is missing.
   */
  private acceptLaunchedFiles(): void {
    const launchQueue = (
      globalThis as {
        launchQueue?: {
          setConsumer(
            consume: (params: {
              files: readonly FileSystemFileHandle[];
            }) => void,
          ): void;
        };
      }
    ).launchQueue;
    launchQueue?.setConsumer((params) => {
      void (async () => {
        const files = await Promise.all(
          params.files.map((handle) => handle.getFile()),
        );
        await this.inbox.offer(files);
      })();
    });
  }

  protected async confirm(choice: ImportChoice): Promise<void> {
    await this.inbox.confirm(choice);
  }

  private async readFragment(): Promise<void> {
    if (typeof location === 'undefined') return;
    const fragment = location.hash;
    if (fragment === '') return;
    if (!(await this.inbox.offerLink(fragment))) return;
    // Cleared as soon as it is read, before the preview opens — by then the
    // payload is in memory and the URL was only ever transport.
    //
    // `replaceState`, never push: Back must not return to the payload, and the
    // rewrite must not itself trigger a navigation this listener then re-reads,
    // which is why it goes through History rather than the Router.
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}`,
    );
  }
}
