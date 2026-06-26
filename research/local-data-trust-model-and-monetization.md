# Trust Model & Monetization Research: unauthenticated local data + cheapest premium tier

> Companion to `google-drive-and-supabase-sync.md`. Achordeon = Angular 21 SPA on GitHub
> Pages, local-first (IndexedDB), greenfield (no auth/data layer/Supabase yet). Author is
> EU-based (Czech) — relevant to the tax discussion in Part 2.

## TL;DR

- **Q1 — leaving local data unauthenticated is fine for Achordeon.** The data is the
  user's own chord sheets/songbooks — low-sensitivity creative content, not PII or
  secrets. The honest threat model is small: the real risks are **(a) XSS reading
  IndexedDB + sync tokens** and **(b) shared-device/shoulder access**, not "no login."
  A login wall on _local_ data would add friction and false security without removing the
  XSS risk. Recommended posture: **no local login; harden the origin (CSP + SRI, minimal
  third-party JS); treat login purely as the gate for _sync_, not local access;** offer
  **optional** passphrase encryption-at-rest later if users ask.
- **Q2 — cheapest to _manage_ ≠ cheapest fee.** For now: a **manual `profiles.plan` flip**
  (you, in the Supabase dashboard) costs nothing and is correct for a handful of users.
  For self-serve later, the cheapest thing to _operate_ (not the lowest %) is a **hosted
  Merchant-of-Record checkout link → one webhook → flip the flag.** Because you're in the
  EU, a **Merchant of Record (Lemon Squeezy / Polar / Paddle) is worth ~5% + €0.50** to
  make all VAT/invoicing/refunds disappear. Raw Stripe is cheaper per-transaction (~2.9% +
  €0.30) but hands _you_ EU VAT compliance — expensive in time, not money. **Ads: don't.**
  Tiny revenue at this scale, GDPR consent overhead, and the look you dislike. If you want
  a no-tax, no-commitment option, **donations (Ko-fi / GitHub Sponsors / BMC)** are the
  cheapest possible "monetization" to stand up.

---

# Part 1 — Is it safe to leave local data unauthenticated?

## 1.1 What "the data" actually is (this drives everything)

Achordeon stores **songs, songbooks, and settings** in IndexedDB. This is:

- the user's **own** content (chord/lyric sheets they typed or imported),
- **not** personal data of _third parties_, not payment data, not credentials,
- already designed to be **exportable as visible JSON** (the Drive backup _is_ that file).

Low sensitivity content + an explicit "your data lives on your device" model is a
completely normal, defensible posture. Plenty of respected local-first apps (note-takers,
markdown editors, tab/chord apps) do exactly this. **A login on local data would not make
the data meaningfully safer** — see threats below — it would just add friction.

## 1.2 The real risks (ranked by how much they actually matter here)

| #   | Risk                                                                                                  | Severity for Achordeon          | Why                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | **XSS** — malicious JS on your origin reads _all_ IndexedDB **and** any sync tokens in `localStorage` | **Highest real risk**           | A login wall does **nothing** against this; same-origin script has full access regardless. This is where to spend effort. |
| 2   | **Sync-token theft** (Supabase session / Google `provider_token` in `localStorage`)                   | Medium–High                     | Same XSS vector; these tokens reach the _cloud_ data, so they're the juicier target than the local songs.                 |
| 3   | **Shared / unlocked device** — another person on the same OS user + browser profile sees the songs    | Low–Medium                      | Mitigated by OS user accounts & browser profiles; a local login _would_ help here, but the data is low-value.             |
| 4   | **Data loss** — user clears browser data / loses device → IndexedDB gone                              | Medium (but **already solved**) | The Drive/Supabase backup from the sync research is the mitigation. Not encryption-related.                               |
| 5   | **Data at rest readable on disk** (no app-level encryption)                                           | Low                             | OS full-disk encryption (BitLocker/FileVault, on by default on modern devices) already covers the realistic theft case.   |
| 6   | **Supply-chain / CDN compromise** of a script you load                                                | Medium                          | Folds into #1; mitigated by the same hardening (SRI, fewer third-party scripts).                                          |

**Takeaway:** the dangerous surface is **client-side script execution (XSS/supply chain)**
and **token storage**, _not_ the absence of a local login. Optimize for those.

## 1.3 Viable options (recommended posture first)

**Option A — No local login; harden the origin; login gates _sync_ only. ✅ Recommended.**

- Local data stays open in IndexedDB; the app is instantly usable with zero auth friction
  (good for a static SPA / first-run experience).
- Authentication (Supabase/Google) is required **only** to use cloud sync — exactly the
  model the sync research already assumes. Login protects _cloud_ data, where it belongs.
- Hardening that actually moves the needle:
  - **Content-Security-Policy** (lock script sources; no inline/`eval`) — the single
    highest-value control against #1/#2/#6. On GitHub Pages, ship it via a `<meta http-equiv>`
    CSP (GitHub Pages can't set response headers).
  - **Subresource Integrity (SRI)** on any third-party `<script>`/`<link>`; minimize the
    number of third-party scripts (analytics, fonts, widgets) — each one can read IndexedDB.
  - Keep dependencies patched (Angular's built-in template escaping already blocks the
    common DOM-XSS sinks; don't bypass it with `innerHTML`/`bypassSecurityTrust*` on
    song content — **song content is user input and renders to HTML**, so this matters).
  - Store sync tokens with the shortest viable lifetime; prefer the Edge-Function token
    broker (Flow B in the sync doc) so the long-lived Google refresh token never sits in
    the browser at all.
- **Document the trust model** in the docs ("your songs live on this device; back up via
  Drive") so the responsibility hand-off is explicit and honest.

**Option B — Optional passphrase encryption-at-rest (Web Crypto), opt-in. (Later / if asked.)**

- Encrypt IndexedDB values with a key derived (PBKDF2/Argon2 via WebCrypto) from a
  user passphrase; decrypt in memory on unlock.
- **Pros:** defends #3 and #5 (theft / shared device).
- **Cons:** does **not** defend #1 (a live XSS runs _after_ decryption); adds a real
  "forgot passphrase = data lost forever" footgun; complicates the visible-JSON Drive
  backup (now it's ciphertext, breaking the export/import interop the sync doc values).
- **Verdict:** not worth it for v1; offer as an _optional_ toggle only if a user with
  sensitive setlists asks. The juice (defends a low-value, theft-only case) isn't worth
  the squeeze (lost-data support load + breaks export interop).

**Option C — Force a login wall in front of _local_ data. ❌ Not recommended.**

- Adds friction to a zero-setup local app, blocks offline first-run, and **doesn't stop
  the top risk (XSS)**. Pure downside for this data type. Only reconsider if Achordeon ever
  stores genuinely sensitive data (it doesn't today).

## 1.4 Bottom line for Q1

Yes — leaving local data unauthenticated is safe **for this data**, provided you (1) keep
login as the gate for _cloud sync_ rather than local access, (2) harden against XSS/supply
chain (CSP + SRI + careful HTML rendering of song content), and (3) state the trust model
plainly in the docs. Optional passphrase encryption is a _later, opt-in_ nicety, not a
requirement.

---

# Part 2 — Cheapest way to manage the premium tier

The key reframe: **"cheapest to manage" is about operational overhead (tax, invoicing,
refunds, code you maintain), not the headline transaction %.** A 2.9% processor that makes
you personally file EU VAT is more "expensive" than a 5% Merchant of Record that makes all
of that vanish.

## 2.1 Now: manual switch — keep it, it's free

- The sync research already gates the paid layer on `profiles.plan` (`'free' | 'pro'`).
- "Manual switch" = you flip `profiles.plan = 'pro'` in the **Supabase dashboard / a SQL
  snippet** for the user. **Cost: €0. Code: none.** Correct for the first handful of users.
- This is the seam everything else plugs into later: any payment system's job is simply to
  **set that one flag**.

## 2.2 Later, paid with money — the options

All of these end the same way: _payment event → webhook → Edge Function sets
`profiles.plan='pro'`_ (cancellation/refund → `'free'`). That Edge Function is **the same
server piece** the sync research already needs (Drive token broker / Supabase tier), so it
does double duty — no _new_ infra.

| Option                                                    | Fee (2026)                                                          | Who handles EU VAT                          | Code you maintain                                  | Best when                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| **Merchant of Record** — Lemon Squeezy / Polar / Paddle   | ~**5% + €0.50** (Polar free tier 5%+50¢; legacy/paid plans ~3.4–4%) | **The MoR** (VAT, invoices, refunds, fraud) | A hosted checkout link + **1 webhook**             | **Recommended.** EU seller, hobby/solo, wants minimal ops |
| **Stripe direct** (+ Stripe Tax)                          | ~**2.9% + €0.30** (+0.5% Stripe Tax)                                | **You** (register/file VAT, e.g. EU OSS)    | Checkout + customer portal + webhooks + tax filing | You're ready to run a real billing stack & file taxes     |
| **Donations** — Ko-fi / GitHub Sponsors / Buy Me a Coffee | ~0–5%, no MoR billing                                               | N/A (gift, not a sale)                      | Often **zero** (external link)                     | Cheapest possible to start; "support the project" vibe    |

### Why a Merchant of Record wins _for you specifically_

- You're **EU-based**. Selling software cross-border means **VAT on digital goods** in the
  buyer's country (EU OSS, plus non-EU regimes). With raw Stripe that compliance is _yours_.
  An MoR is the _legal reseller_ — it collects/remits all of it and issues invoices. That's
  the single biggest "management cost" eliminated.
- **Least code:** MoRs give a hosted checkout URL and a webhook. You don't build a billing
  UI, customer portal, invoice generator, or dunning logic.
- **Lemon Squeezy** (now owned by Stripe) and **Polar** are the indie-friendly picks;
  **Paddle** is the established option. All ~5% + €0.50 on entry tiers — for a low-priced
  hobby subscription the % difference is cents; **operational simplicity dominates.**
- Cheaper newer MoRs exist (Creem ~3.9%, Dodo ~4%) with fewer supported countries —
  worth a look only once volume makes the % matter.

### One-time vs subscription

- A **one-time "lifetime" unlock** is the cheapest _model_ to manage: no recurring billing,
  no churn/dunning, fewer webhook events (just "paid → flip flag"). Strong fit for a hobby
  app and a forgiving way to start charging. A subscription earns more long-term but adds
  renewal/cancellation handling. **Recommendation: start one-time lifetime**, revisit
  subscriptions only if running costs (Supabase) actually scale with users.

## 2.3 Paid with ads — not recommended

- **Revenue is tiny** at small/niche scale (musicians, low traffic); display ads pay
  fractions of a cent per view.
- **GDPR/ePrivacy**: EU ad networks require a consent banner + a CMP — _more_ compliance
  overhead, not less, the opposite of "cheapest to manage."
- **The look:** you already said you dislike it, and it clashes with a clean stage/
  performance UI (ads during a live performance view = bad UX).
- If you still want a "free money" lane without a paywall, **donations** (2.2) give you the
  upside with none of the ad-network/consent/aesthetic cost.

## 2.4 Recommended path for Q2

1. **Today:** manual `profiles.plan` flip in Supabase. €0, zero code.
2. **First paid version:** a **Merchant-of-Record one-time "lifetime Pro" checkout link**
   (Lemon Squeezy or Polar) → **webhook → existing Edge Function → set
   `profiles.plan='pro'`.** MoR absorbs all EU VAT/invoicing. Minimal new code; reuses the
   Edge Function the sync tier already requires.
3. **Optional, alongside:** a **donations** link for users who want to support without the
   Pro features.
4. **Only later, if volume justifies it:** consider switching to Stripe-direct +
   subscriptions (lower %, but you take on tax/billing ops) or a cheaper MoR.
5. **Skip ads.**

---

## Sources

- Local-first security / threat model: general web platform behavior (IndexedDB &
  `localStorage` are same-origin readable; XSS defeats client-side encryption-at-rest;
  GitHub Pages cannot set HTTP headers → CSP via `<meta>`). Cross-checked against the prior
  `google-drive-and-supabase-sync.md` token-storage findings.
- Stripe + Supabase webhook → plan-flag pattern: Supabase Docs "Handling Stripe Webhooks"
  (`supabase.com/docs/guides/functions/examples/stripe-webhooks`).
- 2026 MoR pricing (verified via web search, 2026-06-26): Polar new free tier **5% + 50¢**
  (legacy "Early Member" 4% + 40¢; paid plans 3.4–3.8%); Lemon Squeezy & Paddle **5% + 50¢**;
  Stripe direct **2.9% + $0.30** (+0.5% Stripe Tax); cheaper MoRs Creem ~3.9%, Dodo ~4%.
  (Polar pricing review — Dodo Payments; UserJot fee comparison; fintechspecs MoR guide.)
