// FeedbackService — what the dialog is allowed to conclude from a failure
//
// The transport itself is one `functions.invoke`, and there is nothing to pin
// down about a call that worked. What matters is the other side: `invoke` reports
// every non-2xx identically, as one opaque error with the raw `Response` hanging
// off it, so the difference between "you are early" and "that did not work" only
// exists if this file digs it back out. Those are different sentences to a
// reporter — one asks them to wait, the other asks them to try again — and a
// dialog that cannot tell them apart says the wrong one half the time.

import { TestBed } from '@angular/core/testing';
import {
  FeedbackRejectedError,
  FeedbackService,
  FeedbackThrottledError,
} from './feedback-service';
import { SupabaseService } from '../lobby/supabase-client';

/** What `functions.invoke` hands back for a non-2xx: an error carrying the
 * untouched Response. Mirrors `FunctionsHttpError` closely enough to test on. */
function httpError(status: number, body: unknown): Error {
  const error = new Error('Edge Function returned a non-2xx status code');
  return Object.assign(error, {
    context: {
      status,
      json: () =>
        body === undefined
          ? Promise.reject(new Error('no body'))
          : Promise.resolve(body),
    },
  });
}

describe('FeedbackService', () => {
  let invoke: jest.Mock;
  let service: FeedbackService;

  beforeEach(() => {
    invoke = jest.fn(async () => ({ data: { filed: true }, error: null }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            isConfigured: true,
            client: async () => ({ functions: { invoke } }),
          },
        },
      ],
    });
    service = TestBed.inject(FeedbackService);
  });

  it('sends the report, and the honeypot always empty', async () => {
    await service.send({ kind: 'bug', message: 'It wraps mid-bar.' });

    expect(invoke).toHaveBeenCalledWith('feedback', {
      body: {
        kind: 'bug',
        message: 'It wraps mid-bar.',
        contact: null,
        payload: null,
        website: '',
      },
    });
  });

  // The absence IS the consent record (see FeedbackReport): an omitted payload
  // has to reach the endpoint as an explicit null, not as a missing key that a
  // later caller could read as "not filled in yet".
  it('sends a declined attachment as null, not as an absent field', async () => {
    await service.send({ kind: 'idea', message: 'A capo indicator.' });

    const body = invoke.mock.calls[0][1].body;
    expect('payload' in body).toBe(true);
    expect(body.payload).toBeNull();
  });

  it('reads a rate limit as its own thing, not as a failure', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, {}) });

    await expect(
      service.send({ kind: 'bug', message: 'Again, sorry.' }),
    ).rejects.toBeInstanceOf(FeedbackThrottledError);
  });

  it('carries the endpoint’s reason out of a refusal', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(400, { reason: 'payload-too-large' }),
    });

    await expect(
      service.send({ kind: 'bug', message: 'Here is my whole songbook.' }),
    ).rejects.toMatchObject({ reason: 'payload-too-large' });
  });

  // A 400 whose body will not parse is still a 400. The status already says which
  // of the three it was, so the dialog gets its sentence either way.
  it('still refuses cleanly when the reason cannot be read', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(400, undefined) });

    await expect(
      service.send({ kind: 'other', message: 'Something odd.' }),
    ).rejects.toBeInstanceOf(FeedbackRejectedError);
  });

  it('leaves anything else a plain failure', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(502, {}) });

    const sent = service.send({ kind: 'bug', message: 'Nothing happens.' });
    await expect(sent).rejects.toThrow(/feedback-failed/);
    await expect(sent).rejects.not.toBeInstanceOf(FeedbackThrottledError);
  });
});
