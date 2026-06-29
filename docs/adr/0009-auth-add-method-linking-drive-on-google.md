# 9. Auth linking is add-method-only; Drive rides on the Google identity

Date: 2026-06-29

## Status

Accepted

## Context

One Achordeon **Account** must be reachable via several sign-in methods (Google
first, email+password planned) — see `CONTEXT.md` and `PRD-INFRASTRUCTURE.md` §5.
Login exists **only for data sync**; it never gates local use, so the stakes are
low. Two design questions surfaced while grilling D6, both shaped by how Supabase
Auth actually behaves.

**1. How do two methods become one Account?** Supabase auto-links a new sign-in to
an existing user when the **verified** email matches (this is built in and cannot be
disabled; it is safe because it only fires on verified emails). Beyond that, the
only linking primitive is `linkIdentity()` / `updateUser()`, which attaches a
provider to the **currently logged-in** user. Supabase has **no merge-users
operation**: if the email being linked already belongs to a _different_ user, the
call errors. So once two _populated_ accounts exist, they cannot be joined — and the
app is local-first, where each synced account carries its own library.

**2. Is "Connect Drive" identity-free?** `CONTEXT.md` originally called Drive "a
storage connection … not a separate identity." But §6 Flow A connects Drive via
Supabase Google OAuth (`signInWithOAuth(drive.file)`), which necessarily touches the
Supabase Google **identity**. For a non-Google account, issuing a Drive token would
have to attach a Google identity — so Drive is not, in fact, identity-free.

### Options

- **Merge vs add-method.** (A) Build in-app account merge — re-key every
  `songs`/`songbooks` row from one `user_id` to another with conflict resolution.
  Real complexity for a corner case. (B) Support only _add a method to the current
  account_; refuse to merge two populated accounts.
- **Drive identity coupling.** (A) Drive rides on the Google identity — offer
  "Connect Drive" only to accounts that have Google (link it first if absent).
  (B) Run a second, raw Google OAuth client outside Supabase so Drive is a pure,
  identity-free storage grant — honors the old wording but is a whole extra OAuth
  stack to build and secure, contradicting §6 Flow A.

## Decision

**Add-method-only linking, and Drive rides on the Google identity.**

- Linking always means **attach a method to the account you are logged into**
  (`linkIdentity` for Google, `updateUser` for password), surfaced as an explicit
  "add a sign-in method" action in Settings. Automatic same-email linking stays on
  (it is unavoidable and safe).
- **Email confirmation is required**, so an unconfirmed email/password identity
  grants no session and never links — the precondition that makes the above safe
  against pre-account-takeover.
- **Two already-populated accounts are not mergeable in v1.** The escape hatch is
  Export (JSON) → Import → abandon the duplicate.
- **"Connect Drive" is carried by the Google identity.** A non-Google account must
  link Google first (the Connect-Drive button can drive that link). Drive is not a
  separate _account_, but it is the Google _identity_.
- **No unlinking in v1** (add-only); `unlinkIdentity` is deferred.

## Consequences

- No row-reassignment / merge code and no second OAuth integration in v1 —
  materially less to build and to get wrong.
- The explicit Settings "add a method" flow is the safe path: it structurally cannot
  spawn a second account, which is the only way the unmergeable-accounts trap is hit.
- A user who registers a _second_ account with a _different_ email (e.g. on another
  device) and fills it with songs lands in a dead end relative to their first
  account; only Export/Import gets them out. This is an accepted v1 limitation.
- Email/password users who want Drive are pushed to also have Google linked — a mild
  coupling, acceptable since Free-tier sync is Drive-on-Google anyway.
- Both limitations are clean future upgrades: in-app merge (row re-keying +
  conflict resolution) and an identity-free Drive grant can be added later without
  invalidating this model.
