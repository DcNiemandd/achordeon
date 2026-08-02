// What the reporter was working on — the feedback dialog's third checkbox.
//
// "Send app data" is worth little on its own: a build date and a user agent place
// a bug report but do not reproduce it. The thing that reproduces it is usually
// the song — the one whose chord line wraps wrong, whose transpose lands a
// semitone out, whose section the renderer swallows. So the dialog offers to
// attach it, and this is how it knows there is one to offer.
//
// A registry, in the shape `StageSession` established: the feature that owns the
// screen declares what is on it, and anything in the shell may ask.
//
// **It outlives the screen, deliberately.** The dialog is reached from Settings,
// and going to Settings destroys the editor — so a registry cleared on teardown
// would be empty at precisely the moment it is read, and the checkbox could never
// appear at all. What is offered is therefore "the song you were working on", not
// "the song on screen", and it is held for a window rather than forever: half an
// hour is one sitting, long enough to walk to Settings and write a paragraph, and
// short enough that tomorrow's report is never offered yesterday's song.

import { Injectable, signal } from '@angular/core';
import type { FeedbackSubject } from './feedback-model';

/** How long a departed subject stays on offer. One sitting, not one day. */
const MAX_AGE_MS = 30 * 60 * 1000;

interface Held {
  readonly subject: FeedbackSubject;
  readonly at: number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackContext {
  private readonly held = signal<Held | null>(null);

  /**
   * Declare what this screen is showing. Called from a page's `effect`, so it
   * follows the record being edited rather than the route that opened it.
   */
  set(subject: FeedbackSubject): void {
    this.held.set({ subject, at: Date.now() });
  }

  /**
   * Leave the screen — which starts the clock rather than stopping it. The
   * subject stays on offer for the window; only a stale one is dropped, and it is
   * dropped on read (below) so nothing has to keep a timer running.
   */
  release(): void {
    const held = this.held();
    if (held !== null) this.held.set({ ...held, at: Date.now() });
  }

  /**
   * What a report opened right now would offer to attach, or null.
   *
   * A **method, not a signal**, because its answer depends on the clock as much
   * as on the stored value, and a computed over `Date.now()` would cache the
   * first reading forever. The dialog calls it once, on open, and holds that
   * answer for as long as it is up — which is the right granularity: the offer
   * should not vanish out from under someone mid-sentence.
   */
  current(): FeedbackSubject | null {
    const held = this.held();
    if (held === null) return null;
    if (Date.now() - held.at > MAX_AGE_MS) {
      this.held.set(null);
      return null;
    }
    return held.subject;
  }
}
