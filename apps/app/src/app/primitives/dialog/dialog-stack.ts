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

  readonly isOpen = computed(() => this.count() > 0);

  /** Called by `Dialog` on mount; the returned function is its `onDestroy`. */
  claim(): () => void {
    this.count.update((open) => open + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.count.update((open) => Math.max(open - 1, 0));
    };
  }
}
