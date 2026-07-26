// Document title — Epic 13 follow-up ▸ what the tab says
// Spec: PRD-UI-SHELL.md §4 (the shell owns the frame; a tab strip is part of it)

import {
  DOCUMENT,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ALL_NAV_ITEMS } from './nav-items';

/** Not localized: it is the product's name, the same in every language. */
const APP_NAME = 'Achordeon';

interface TitleClaim {
  readonly subject: () => string;
}

/**
 * Keeps `document.title` describing where you are.
 *
 * Three shapes, and the order of the two words is the point of each:
 *
 * - **A module** — `Achordeon - Songs`. You are in the app, looking at one of its
 *   places, and a tab strip full of them should sort and read by the app.
 * - **A song or a songbook** — `Down by the River - Achordeon`. You are looking at
 *   a *document*, and its own name is what you are hunting for among fifteen tabs.
 * - **Performing** — `Performing - Achordeon`. A document again in the shape of
 *   the title, but the thing worth naming is the act, not the book: the tab
 *   belongs to the performance, and the songbook's name is already on screen.
 *
 * The module is read off the URL, the way `ModuleSwitcher` reads it — no
 * `router.events`, no `toSignal` (the no-RxJS rule, PRD-INFRASTRUCTURE.md §3). A
 * document's name cannot be: it lives in a record the shell may not load
 * (`shared/**` must not touch a store), so the *page* claims the title and hands
 * over an accessor. Because that accessor is read inside a computed, a rename
 * lands in the tab without anyone telling us.
 *
 * The static `<title>` in `index.html.template` is the plain app name, which is
 * what the tab says before Angular has booted and what a bookmark of the app root
 * keeps.
 */
@Injectable({ providedIn: 'root' })
export class DocumentTitle {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  private readonly _claim = signal<TitleClaim | null>(null);

  /** Null before the first navigation resolves; `router.url` covers that moment. */
  private readonly url = computed(() => {
    const finalUrl = this.router.lastSuccessfulNavigation()?.finalUrl;
    return finalUrl ? this.router.serializeUrl(finalUrl) : this.router.url;
  });

  /** The nav label for the module this URL is in, or '' off the nav tree. */
  private readonly module = computed(
    () =>
      ALL_NAV_ITEMS.find((item) => this.url().startsWith(item.route))?.label ??
      '',
  );

  readonly title = computed(() => {
    // A claimed subject wins — but only once it has a value. A song's name
    // arrives an IndexedDB read after the route does, and `- Achordeon` with a
    // hole in front of it is worse than the module title it replaces a tick later.
    const subject = this._claim()?.subject().trim();
    if (subject) return `${subject} - ${APP_NAME}`;
    const module = this.module();
    return module ? `${APP_NAME} - ${module}` : APP_NAME;
  });

  constructor() {
    effect(() => {
      this.document.title = this.title();
    });
  }

  /**
   * Name this document instead of its module, for as long as the caller lives.
   *
   * Returns the release, which the caller wires to its own `DestroyRef` — and the
   * release only clears a claim that is **still ours**, because the router builds
   * the next page's component before it is done with the old one's teardown in
   * some orders, and a late release would otherwise wipe the new page's title.
   */
  claim(subject: () => string): () => void {
    const claim: TitleClaim = { subject };
    this._claim.set(claim);
    return () => {
      if (this._claim() === claim) this._claim.set(null);
    };
  }
}
