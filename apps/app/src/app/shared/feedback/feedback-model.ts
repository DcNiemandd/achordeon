// Feedback UI contract — the "report a problem" dialog.
// Spec: PRD-UI-SHELL.md §3 (the presenter seam)
//
// The vocabulary the dialog speaks. Declared here rather than imported from
// `shared/data-access`, which the import ladder forbids this folder from touching:
// these are structurally `FeedbackService`'s own types, so a drift between the two
// breaks the *presenter's* build — which is where a mismatch should surface, since
// the presenter is the only thing spanning both. The same trick `transfer-model.ts`
// plays with the transfer services' types.

/** What a report is. Three, because a triager sorts by intent before content. */
export type FeedbackKind = 'bug' | 'idea' | 'other';

/** What the reporter is looking at, when it is something the report is about. */
export interface FeedbackSubject {
  readonly kind: 'song' | 'songbook';
  /** Shown on the checkbox, so the offer names the thing rather than a category. */
  readonly name: string;
  /**
   * The attachment itself, fetched only if the box is ticked.
   *
   * **A thunk, not a value**, for two reasons. It is *async* — what it returns is
   * the same snapshot Export writes, which is read from the saved record rather
   * than from a signal — and it is *unpaid for* until someone consents: a subject
   * declared by every screen visit must not serialise a song each time on the
   * chance that a report might later be opened.
   */
  readonly snapshot: () => Promise<Record<string, unknown>>;
}

/** One filled-in dialog, on its way to the presenter. */
export interface FeedbackDraft {
  readonly kind: FeedbackKind;
  readonly message: string;
  /** How to write back, or null if the reporter left it blank. */
  readonly contact: string | null;
  /** Exactly what the ticked boxes attached, or null if none were ticked. */
  readonly payload: Record<string, unknown> | null;
}
