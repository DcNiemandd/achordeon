// Where the editor goes back to — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §7 (the URL is the list's state)

import { Injectable, signal } from '@angular/core';

/**
 * The list URL the editor returns to — captured, query and all, the moment a
 * song is opened.
 *
 * **Set by whoever opens the editor, not by the editor.** The Songs module
 * records the library URL it left; the Songbooks builder records its own URL —
 * preview dialog and all — before an Edit press walks into the same editor. So it
 * lives in `shared`, above both: it is the one fact the two entrances share, and
 * a service one feature owned would be a sibling the other had to reach across
 * for (features are folders here, and a folder does not import its neighbour).
 *
 * **Not the browser's history.** Between the list and the editor the user may
 * have flipped a pane or two, so `history.back()` lands on one of those in-editor
 * states, not the filtered list they came from. This holds the one URL that is
 * the real "back", so Escape and the back link go straight to it.
 *
 * **Not localStorage.** It is one navigation's memory, not a saved preference —
 * the list's own state lives in *its* URL (§7), and this is only the pointer back
 * to it. A signal, so the back link's href updates the instant it is set; empty
 * after a reload, where nothing opened the editor to record a where-from, and the
 * bare `/songs` is the honest fallback.
 */
@Injectable({ providedIn: 'root' })
export class ReturnUrl {
  private readonly _url = signal<string | null>(null);

  /** The captured list URL, or null when the editor was reached cold. */
  readonly url = this._url.asReadonly();

  set(url: string): void {
    this._url.set(url);
  }
}
