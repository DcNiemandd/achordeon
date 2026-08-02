// Feedback endpoint — the in-app "report a problem" dialog.
//
// The app used to point at the GitHub issue tracker and stop there, which asked a
// musician with a broken render to open a browser tab, hold a GitHub account, and
// describe a build they cannot see the version of. This is the same destination
// reached from inside the app: the report still becomes a GitHub issue, but the
// reporter never leaves Achordeon and never learns that GitHub is involved.
//
// It is a **server** endpoint rather than a table insert from the browser for one
// reason: the GitHub token. The client holds only the anon key (public by design),
// so anything that can create an issue has to run somewhere the token can live —
// and once there is a server, it is also the only place a size cap or a rate limit
// can actually be enforced.
//
// Deployed from `main` by the Supabase GitHub integration along with the
// migrations. Secrets are NOT deployed with it — see supabase/functions/.env.example.

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** What the dialog can file. Anything else is a 400. */
const KINDS = ['bug', 'idea', 'other'] as const;
type Kind = (typeof KINDS)[number];

/** Long enough to say what broke, short enough that nobody pastes a novel. */
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;
const CONTACT_MAX = 200;
/** The attached app data, serialised. A song's content is the big item in here. */
const PAYLOAD_MAX_CHARS = 64_000;

/** Reports allowed from one IP hash per window. Generous for a human reporting a
 * real bug (and a second thought about it), useless as a spam pipe. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * A decoy field. The app always sends it empty; a filled one is not the app.
 *
 * Nothing in Achordeon renders it — it exists only in the JSON contract, so the
 * poster that fills it in is one that read the shape and populated everything it
 * found. That is a narrow catch and it is not the load-bearing defence (the rate
 * limit is), but it costs one comparison and it runs before any of them.
 */
const HONEYPOT_FIELD = 'website';

const CORS = {
  // The endpoint is public and takes no cookies, so there is nothing an origin
  // allow-list would protect — a hostile caller does not need a browser. The real
  // gates are the anon-key JWT, the rate limit and the caps.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Submission {
  kind: Kind;
  message: string;
  contact: string | null;
  payload: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'malformed');
  }

  // The honeypot answers first: a filled one means nothing else is worth reading.
  // It reports success, because a bot told it was blocked simply tries again.
  if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD] !== '') {
    return ok({ filed: false });
  }

  const submission = validate(body);
  if (typeof submission === 'string') return fail(400, submission);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const hash = await ipHash(req);
  if (await isRateLimited(admin, hash)) return fail(429, 'rate-limited');

  // Counted before the slow part, so a burst arriving together cannot all slip
  // past the check while the first one is still talking to GitHub.
  await admin.from('feedback_throttle').insert({ ip_hash: hash });
  await sweepThrottle(admin);

  const userId = await callerId(req);
  const filed = await fileIssue(submission, userId);
  if (filed.ok) return ok({ filed: true, url: filed.url });

  // GitHub refused. The report is not lost — it lands in the table, and the
  // reporter is told it arrived, because from where they stand it did.
  const { error } = await admin.from('feedback_reports').insert({
    kind: submission.kind,
    message: submission.message,
    contact: submission.contact,
    user_id: userId,
    payload: submission.payload ?? null,
    github_error: filed.error,
  });
  if (error) return fail(502, 'not-stored');
  return ok({ filed: true });
});

/** @returns the cleaned submission, or the error code naming what was wrong. */
function validate(body: Record<string, unknown>): Submission | string {
  const kind = body.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as Kind)) {
    return 'bad-kind';
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return 'bad-message';
  }

  const raw = typeof body.contact === 'string' ? body.contact.trim() : '';
  if (raw.length > CONTACT_MAX) return 'bad-contact';
  // Deliberately loose: this is a note to a human, not a login. It only has to be
  // shaped like an address, so a typo is the reporter's problem and not a refusal.
  if (raw !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    return 'bad-contact';
  }

  const payload = body.payload ?? null;
  if (payload !== null) {
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      return 'bad-payload';
    }
    if (JSON.stringify(payload).length > PAYLOAD_MAX_CHARS) {
      return 'payload-too-large';
    }
  }

  return {
    kind: kind as Kind,
    message,
    contact: raw === '' ? null : raw,
    payload,
  };
}

/**
 * A salted hash of the caller's address.
 *
 * Salted, so the table cannot be walked back to a list of addresses by hashing the
 * IPv4 space — which is small enough to exhaust. Without `FEEDBACK_IP_SALT` set,
 * every caller hashes to the same bucket and the whole endpoint shares one budget:
 * a misconfiguration that fails towards *less* traffic, never towards more.
 */
async function ipHash(req: Request): Promise<string> {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim();
  const salt = Deno.env.get('FEEDBACK_IP_SALT') ?? '';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// deno-lint-ignore no-explicit-any
async function isRateLimited(admin: any, hash: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from('feedback_throttle')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', hash)
    .gte('created_at', since);
  // A limiter that cannot read its own ledger lets the report through. Losing a
  // real bug report is the worse of the two failures.
  if (error) return false;
  return (count ?? 0) >= RATE_LIMIT;
}

/** Drop what the window has moved past, so the ledger never grows without bound. */
// deno-lint-ignore no-explicit-any
async function sweepThrottle(admin: any): Promise<void> {
  const cutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  await admin.from('feedback_throttle').delete().lt('created_at', cutoff);
}

/**
 * The signed-in reporter's id, or null.
 *
 * Purely a convenience for answering — most of the app's users never sign in, so
 * this can never be a requirement. The header carries the anon key when signed
 * out, which resolves to no user, which is the same thing as not sending one.
 */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  try {
    const client = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data } = await client.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** @returns whether the issue was created, and the GitHub error if it was not. */
async function fileIssue(
  submission: Submission,
  userId: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = Deno.env.get('GITHUB_ISSUE_TOKEN');
  const repo = Deno.env.get('GITHUB_ISSUE_REPO');
  if (!token || !repo) return { ok: false, error: 'not-configured' };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title(submission),
          body: issueBody(submission, userId),
          labels: ['from-app', submission.kind],
        }),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status} ${await response.text()}`,
      };
    }
    const created = (await response.json()) as { html_url?: string };
    return { ok: true, url: created.html_url ?? '' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'fetch-failed',
    };
  }
}

/** The first line of the report, trimmed to something a list can show. */
function title({ kind, message }: Submission): string {
  const first = message.split('\n')[0].trim();
  const short = first.length > 80 ? `${first.slice(0, 79)}…` : first;
  return `[${kind}] ${short}`;
}

function issueBody(
  { message, contact, payload }: Submission,
  userId: string | null,
): string {
  const parts = [message, '', '---', '', '_Filed from the app._'];
  if (contact) parts.push(`Reply to: ${contact}`);
  if (userId) parts.push(`Account: \`${userId}\``);
  if (payload) {
    parts.push(
      '',
      '<details><summary>App data (attached by the reporter)</summary>',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
      '',
      '</details>',
    );
  }
  return parts.join('\n');
}

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** The reason travels as a code, not a sentence: the app owns the wording, in the
 * reporter's own language, and a server has no business guessing which. */
function fail(status: number, reason: string): Response {
  return new Response(JSON.stringify({ reason }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
