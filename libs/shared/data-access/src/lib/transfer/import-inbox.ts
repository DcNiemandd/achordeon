// ImportInbox — the app-level owner of "something arrived, import it" (plan §4/§7)
//
// A link tapped, a file dropped on the page, a file picked from a module's Import
// button: three transports, one event. Before this existed, `ImportPanel` was
// mounted per module and each presenter ran its own read/plan/apply — so a drop on
// a page that mounts no panel had nobody to hand the file to, and a link had
// nobody at all.
//
// **It lives in `shared/data-access`, beside `ImportService`, and that is forced.**
// Four rules decide it between them: `app/shared/**` may never import data-access,
// nor may a `*.page.ts` or a `*.component.ts` ("components never inject a store —
// that is the presenter rule"), a feature folder may not import a sibling feature,
// and nothing may import a root shell file. This has to be reachable from the
// shell AND from two feature presenters, so every in-app location fails one of the
// four. A shared lib is outside the boundaries graph, and presenters already inject
// data-access services today.
//
// It hands back an `ImportPlan`, not an `ImportPreview`: the dialog's vocabulary is
// deliberately declared in the app's own `transfer-model.ts` rather than imported
// from here, and presenters keep doing that mapping.

import { Injectable, computed, inject, signal } from '@angular/core';
import type { ImportChoices, ImportPlan } from '@achordeon/shared/domain';
import { SongStore } from '../stores/song-store';
import { SongbookStore } from '../stores/songbook-store';
import { ImportError, ImportService } from './import-service';
import { fromShareLink } from './share-link';

/** Why something that arrived could not be imported — the two a user can act on. */
export type InboxFailure = 'unreadable' | 'refused';

/** What the inbox is showing right now, for a dialog to draw. */
export interface InboxItem {
  readonly plan: ImportPlan;
  /** The file carries settings this build does not know — additive, from a newer
   * app. Kept, not dropped; the user is told, not stopped. */
  readonly hasUnknownSettings: boolean;
  /** How many incoming songs the parser has something to say about — said before
   * anything is written, because import otherwise never looks at the content and
   * a song whose markup is wrong lands silently. */
  readonly flaggedSongs: number;
}

@Injectable({ providedIn: 'root' })
export class ImportInbox {
  private readonly importer = inject(ImportService);
  private readonly songs = inject(SongStore);
  private readonly songbooks = inject(SongbookStore);

  /** Waiting their turn. **Sequential is not only the calmer UI, it is the only
   * correct order**: `planImport` computes conflicts against the library as it
   * stands, so a second file must be planned after the first is applied or it
   * cannot see what the first one added. */
  private readonly queue = signal<readonly Blob[]>([]);
  private readonly _item = signal<InboxItem | null>(null);
  private readonly _failure = signal<InboxFailure | null>(null);
  private readonly _isBusy = signal(false);

  /** Fragments already taken, so a restored session cannot run one twice. */
  private readonly consumed = new Set<string>();

  /** The preview being asked about, or null. */
  readonly item = this._item.asReadonly();
  /** A read that failed, or null. */
  readonly failure = this._failure.asReadonly();
  /** A read or a write in flight — the dialog's spinner. */
  readonly isBusy = this._isBusy.asReadonly();
  /** Something is on screen. */
  readonly isOpen = computed(
    () => this._item() !== null || this._failure() !== null,
  );
  /** How many are still waiting behind whatever is on screen — what tells a
   * dropped queue from a single file, and so whether "Cancel all" means
   * anything. */
  readonly remaining = computed(() => this.queue().length);
  /**
   * Bumped once per applied import.
   *
   * The stores are refreshed here, so a list looks after itself. A screen holding
   * a number the stores do not answer for — a library count, say — has no other
   * way to hear about a write, because the import that caused it may have come
   * from a drop or a link rather than from that screen's own button.
   */
  readonly writes = computed(() => this._writes());
  private readonly _writes = signal(0);

  /**
   * Take one or more files. Each is previewed in turn; nothing is written until
   * the preview for it is confirmed.
   *
   * **A dropped PNG already works**: `read` tries the embedded metadata before it
   * reads text, so a downloaded song image imports with no extra code here.
   */
  async offer(files: readonly Blob[]): Promise<void> {
    if (files.length === 0) return;
    this.queue.update((pending) => [...pending, ...files]);
    if (!this.isOpen() && !this._isBusy()) await this.advance();
  }

  /**
   * Take the envelope a URL's fragment carries, if it carries one.
   *
   * Returns true when a payload was found — the caller's cue to clear the
   * fragment. **Cleared as soon as it is read**, before the preview opens: by then
   * the payload is in memory and the URL was transport, not state. Left until
   * confirm, a reload while the dialog is open re-offers the same import, and a
   * multi-kilobyte blob sits in the address bar where it gets bookmarked or copied
   * by accident. Cancelling loses nothing — the link is still wherever it was
   * tapped from.
   */
  async offerLink(fragment: string): Promise<boolean> {
    if (fragment === '' || this.consumed.has(fragment)) return false;
    let payload: Blob | null;
    try {
      payload = await fromShareLink(fragment);
    } catch {
      // It was a share link and it did not decode. Truncated and corrupt are
      // indistinguishable and have the same answer.
      this.consumed.add(fragment);
      this._failure.set('unreadable');
      return true;
    }
    if (payload === null) return false;
    this.consumed.add(fragment);
    await this.offer([payload]);
    return true;
  }

  /** Write the plan under the user's answer, then take the next in the queue. */
  async confirm(choices: Omit<ImportChoices, 'now' | 'newId'>): Promise<void> {
    const current = this._item();
    this._item.set(null);
    if (!current) return;
    this._isBusy.set(true);
    try {
      await this.importer.apply(current.plan, choices);
      // Both stores hold a window of a query the import just changed, several
      // times over, at ids the window never held. A book imported here would
      // otherwise stay invisible in the Songbooks module until a reload.
      await this.songs.refresh();
      await this.songbooks.refresh();
      this._writes.update((n) => n + 1);
    } finally {
      this._isBusy.set(false);
    }
    await this.advance();
  }

  /**
   * Not this one — go on to the next.
   *
   * Cancel means "not this file", not "stop": a five-file drop can be triaged in
   * one pass. {@link cancelAll} is the way out, which is why the dialog offers it
   * whenever anything is still queued.
   */
  async skip(): Promise<void> {
    this._item.set(null);
    this._failure.set(null);
    await this.advance();
  }

  /** Drop this one and everything still waiting. */
  cancelAll(): void {
    this.queue.set([]);
    this._item.set(null);
    this._failure.set(null);
  }

  /** Read and plan the next blob, or fall quiet when the queue is empty. */
  private async advance(): Promise<void> {
    const [next, ...rest] = this.queue();
    if (next === undefined) return;
    this.queue.set(rest);

    this._isBusy.set(true);
    try {
      const source = await this.importer.read(next);
      const plan = await this.importer.plan(source.snapshot);
      this._item.set({
        plan,
        hasUnknownSettings: source.status === 'warn',
        flaggedSongs: this.importer.flagged(plan.songs),
      });
    } catch (error) {
      this._failure.set(
        error instanceof ImportError && error.reason === 'refused'
          ? 'refused'
          : 'unreadable',
      );
    } finally {
      this._isBusy.set(false);
    }
  }
}
