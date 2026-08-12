// Dialog chrome — how many are open
// Spec: PRD-UI-SHELL.md §2

import { Injectable, computed, signal } from '@angular/core';

/**
 * Whether anything is asking a question right now.
 *
 * A dialog covers the screen behind it, and a key pressed while one is up
 * belongs to the dialog even when the dialog has no use for it — otherwise a
 * bare letter would act on a list the user cannot currently see. The keyboard
 * layer reads this; `Dialog` keeps it up to date for as long as it is mounted.
 *
 * It lives beside `Dialog` rather than with the shortcuts because primitives may
 * import nothing in-repo (the import ladder, PRD-UI-SHELL.md §3): the dependency
 * has to point this way round.
 */
@Injectable({ providedIn: 'root' })
export class DialogStack {
  private readonly count = signal(0);

  /**
   * How each open dialog says "close me" — its own `closed` output, which is the
   * only honest way to shut one: a dialog never unmounts itself, its caller
   * decides what closing means (see `Dialog.closed`).
   */
  private readonly openDialogs = new Set<() => void>();

  readonly isOpen = computed(() => this.count() > 0);

  /** Called by `Dialog` on mount; the returned function is its `onDestroy`. */
  claim(dismiss: () => void): () => void {
    this.count.update((open) => open + 1);
    this.openDialogs.add(dismiss);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.openDialogs.delete(dismiss);
      this.count.update((open) => Math.max(open - 1, 0));
    };
  }

  /**
   * Close everything that is open — what **the nav** calls when it is clicked.
   *
   * A modeless dialog (`mode="container"`) dismisses itself when the pane it
   * sits on is clicked, because it can see that for itself. The rail and the
   * mobile switcher are outside that pane and outside every pane, so they have
   * to say so, and saying so is right: reaching for the nav is leaving, and
   * leaving with a settings panel still hanging over the next screen is the
   * behaviour nobody wants. It goes through here rather than through each
   * screen's presenter so a dialog nobody thought about is covered too.
   */
  dismissAll(): void {
    // A copy: `dismiss` runs the caller's close, which releases the claim and
    // mutates the set underneath the iteration.
    for (const dismiss of [...this.openDialogs]) dismiss();
  }
}
