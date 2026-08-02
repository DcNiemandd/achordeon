// Feedback transport — the in-app "report a problem" dialog.
//
// Spec: supabase/functions/feedback/index.ts is the other half of this seam.
//
// The whole of what this file knows is: a report is a POST to one edge function,
// and the function answers with a code. It does not know what a report is for,
// what the dialog looks like, or what the codes should say to a human — the app
// owns the wording, in the reporter's own language.

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../lobby/supabase-client';

/** What the dialog can file. Mirrors the function's own list. */
export type FeedbackKind = 'bug' | 'idea' | 'other';

/** One submission, as the endpoint takes it. */
export interface FeedbackReport {
  readonly kind: FeedbackKind;
  readonly message: string;
  /** How to write back, if the reporter offered it. */
  readonly contact?: string | null;
  /**
   * What the reporter ticked "send app data" for, or null.
   *
   * The **absence is the consent record**: nothing is attached unless a box was
   * ticked, so a null payload is a positive statement that they declined, not a
   * gap to be filled in later by a more helpful caller.
   */
  readonly payload?: Record<string, unknown> | null;
}

/**
 * The rate limiter turned this one away.
 *
 * Its own type because it is the one failure that is not a fault: the report was
 * fine and the reporter should simply come back later, which is a different
 * sentence from "something went wrong".
 */
export class FeedbackThrottledError extends Error {
  constructor() {
    super('feedback-throttled');
    this.name = 'FeedbackThrottledError';
  }
}

/** The endpoint refused the submission itself — too long, malformed, no kind. */
export class FeedbackRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`feedback-rejected: ${reason}`);
    this.name = 'FeedbackRejectedError';
  }
}

/**
 * Files a report through the `feedback` edge function.
 *
 * Root-scoped and free: it shares the app's one `SupabaseClient`, so opening the
 * dialog costs nothing until something is actually sent.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Whether reports can be sent at all. False in an offline-only build (no
   * backend configured), where the dialog stands down and the page falls back to
   * the plain GitHub link it has always had.
   */
  get isConfigured(): boolean {
    return this.supabase.isConfigured;
  }

  /**
   * Send one report.
   *
   * Resolves when the endpoint has taken it — which means a GitHub issue exists,
   * or the row that stands in for one does. Rejects with
   * `FeedbackThrottledError`, `FeedbackRejectedError`, or a plain `Error` for
   * everything else (offline, 5xx); the caller turns each into a sentence.
   */
  async send(report: FeedbackReport): Promise<void> {
    const client = await this.supabase.client();
    if (!client) throw new Error('feedback-unconfigured');

    const { error } = await client.functions.invoke('feedback', {
      body: {
        kind: report.kind,
        message: report.message,
        contact: report.contact ?? null,
        payload: report.payload ?? null,
        // The honeypot, always empty from here. It exists so that a poster which
        // is not this client — one that filled in every field it was offered —
        // identifies itself (see the function).
        website: '',
      },
    });
    if (!error) return;

    throw await this.classify(error);
  }

  /**
   * Turn a failed invoke into the error the dialog can act on.
   *
   * `functions.invoke` reports every non-2xx as one opaque `FunctionsHttpError`
   * with the untouched `Response` hanging off `context` — so the status and the
   * reason code have to be read back out of it. A body that will not parse is
   * not worth a second thought: the status alone already says which of the three
   * it was.
   */
  private async classify(error: unknown): Promise<Error> {
    const context = (error as { context?: Response }).context;
    if (!context || typeof context.status !== 'number') {
      return error instanceof Error ? error : new Error('feedback-failed');
    }
    if (context.status === 429) return new FeedbackThrottledError();
    if (context.status === 400) {
      let reason = 'invalid';
      try {
        const body = (await context.json()) as { reason?: string };
        if (typeof body.reason === 'string') reason = body.reason;
      } catch {
        // The status was the whole message.
      }
      return new FeedbackRejectedError(reason);
    }
    return new Error(`feedback-failed: ${context.status}`);
  }
}
