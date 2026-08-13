# Achordeon — what is left

A survey of `docs/` and `apps/docs/docs/` against the code, taken 2026-08-12 on
`main` at `c496918` (the `feat/fonts` merge). It answers one question: **what has
been designed, promised or stubbed, and is not built.**

It is a report, not a plan. Nothing here re-derives a decision — each row points
at the document that already made one, or names the fork that is still open.
**What happens about it lives in [`V2-BOARD.md`](./V2-BOARD.md).** Two rows below
were corrected on 2026-08-12 after checking the code; both are marked in place.

## The short answer

**There is no v1 gap.** Every subtask in `achordeon-implementation.md` is ticked
(120 of 120, epics 1–15), and the four items of `plans/the-font-library-round-two.md`
all landed — verified in code, not taken on the plan's word: `isVariable` reaches
`FontFamily` and `faceSummary`, `AddFontDialog` searches the Google index, the
built-in rows sit behind a `<details>`, and the ten bundled faces are subset
(1.4 MB → 1.1 MB on disk, with `OFL.txt` and ADR-0018 saying so).

What remains falls into six buckets, and only the first two are functionality a
user could ask for by name.

---

## 1. Designed, decided against a fork, not built

Both have a written assignment. Neither can start until one question is answered,
and both questions are recorded.

### 1.1 Sharing a slot — two songs on one sheet

`plans/sharing-a-slot.md`, status **design paused mid-grill**. The vocabulary is
settled and written into `CONTEXT.md` (§Slot, §Share, §Entry); ADR-0013's closing
consequence names this work as its successor.

**The open question gates everything below it:** is a Song's share of a sheet
**authored** (an optional field on `Song`, additive under ADR-0007) or **derived**
from its aspect ratio (no field, no UI, no "which wins")? The plan lays out both
plus a hybrid, with the trade named — derived never makes a Song smaller but
cannot buy the deliberate shrink, and it makes a book's page count depend on the
paper. Nothing in `libs/shared/render-core` or `download-service.ts` implements
either; confirmed by search.

### 1.2 Notation — the rest of it

`docs/NOTATION-PLAN.md`, status **research, not decided**. What shipped is the
_spelling_ half (Epic 12): `respellChords` at the top of the render, `content`
never touched.

> **Corrected 2026-08-12, after reading the code.** This section first called it a
> silent wrong pitch. That was overstated: **no code path misreads its own input.**
> Reading is unconditional and documented, and a bare `B` in source is B natural on
> every device. What is real is that source and output disagree in German (`Bb`
> prints as `B`, so a page copied back into the editor is a semitone up), that
> `settings.mdx` advertises "B for B♭" without saying a typed `B` stays B natural,
> and that nothing warns. See `V2-BOARD.md` [V2-02].

`NOTATION-PLAN.md` §4 answers the input half: strict German is an **input
dialect**, normalised once at the import boundary (the `song-from-image` /
`song-from-text` skills already own that step), never a storage format.

The fork is §3 — Option A (`Bb` stays `Bb` in German; German is half-German, zero
ambiguity) versus Option B (strict reading, fully idiomatic, but a song's meaning
depends on state outside the chord token and every stored song needs a migration).
The plan **recommends A** and gives the reason: a German reader seeing `Bb` reads
the right note and tuts; under today's behaviour they play the wrong one and do
not know.

§7 has the order of work once §3 is settled, and it is mostly deletion.
`PARSER-GRAMMAR.md` §Notation lists the same parked items (strict German input,
solfège accidentals `Cis`/`Des`/`As`/`Es`, German transpose output).

---

## 2. Stubs a user can see

These are shipped surfaces that say "soon" or say nothing at all. They are the
cheapest things on this page and the most visible.

- ~~**Three of four title-page variants.**~~ **Built — see [V2-05].** There are
  twenty-one now and every one of them draws; the "(soon)" suffix and the
  `disabled` option are gone. The two duplicate declarations of `TitlePageVariant` are one
  again (`shared/domain`, re-exported by `download-service.ts`).
- **Rebinding a keyboard shortcut.** Two `:::danger` admonitions promise it —
  `apps/docs/docs/songs/editing.mdx:64` ("Let the shortcuts be rebound in
  settings") and the TODO list at `settings.mdx:8`. Epic 15's closing note and
  `DOC-REVISION-PLAN.md` §Still genuinely open both name it, and the epic states
  the groundwork is done: one action declaration per action is exactly what a
  settings screen would rebind without touching a component. Nothing in
  `shared/keyboard` reads a stored map today.
- **The account is invisible outside Settings.** `apps/docs/docs/account.mdx:53`,
  verbatim: somebody who never opens Settings never learns their library could be
  backed up at all. This is a UX gap with a doc admitting it, not a missing
  feature — the account needs a way of being found from where the user already is.
- **Aspect-ratio presets are unreadable.** Still true, but no longer unmeasured —
  the `TODO` in `shared/settings-panel/aspect-options.ts` is now a counter
  (`Stats.countAspectRatio`, behind the statistics opt-in), so which rows earn
  their place is a question with evidence coming. Curating the list is [V2-09]'s
  v2 half.

---

## 3. Wired, never exercised end to end

The code paths exist and typecheck. No automated test drives them, and in two
cases nothing has ever run them against a real service.

- **Google OAuth and the Drive REST calls** need real credentials (Epic 10's own
  deferral note). Upload/download, the `drive.file` scope, the modifiedTime guard
  and Flow A re-auth are all written and unproven.
- ~~**`lobby_events` analytics.**~~ **Corrected 2026-08-12: rows are arriving.**
  Two migrations from 2026-08-04 fixed it — `lobby_events_anonymous` dropped
  `owner`'s NOT NULL and gave `anon` an insert policy, and `lobby_events_anon_grant`
  added the table privilege the policy was sitting on (`42501` until it did).
  Anonymous hosts log too, which is the population that matters: hosting never
  required an account.
- **Supabase Realtime `subscribe` is a deliberate no-op** (ADR-0004: handoff, not
  concurrent sync). Listed here so it is not mistaken for a hole.
- **Premium activation is a manual dashboard flip** of `profiles.plan`. D7 (the
  MoR webhook → Edge Function) is explicitly post-v1 in `PRD.md`, and premium is
  free during testing, so no payment path ships. Nothing is broken; the row is
  here because the docs describe tiers a user cannot buy into.

---

## 4. Documents that have drifted

Not functionality, but the map is what the next session reads first. **Four of
the five rows below are fixed — [V2-03]** — and they are struck rather than
deleted so the survey still reads as what was found.

- ~~**`PRD-EDITOR.md` was never written.**~~ Its row in `PRD.md` says so, and
  names where its content actually lives instead of promising a fourth copy.
- ~~**`PRD.md` still shows P1 as ⬜ open.**~~ ✅ in the table and in the graph.
- ~~**`achordeon-implementation.md` stops at Epic 15.**~~ It runs to Epic 28, and
  says in its header which epics were planned up front and which were written
  after the fact.
- ~~**`DOC-REVISION-PLAN.md` §Still genuinely open**~~ points its three rows at
  [V2-13], [V2-08] and [V2-14].
- **`PRD-UI-SHELL.md` §13** holds four open questions that each need one look
  rather than a debate: grey-ramp temperature against a warm brand, gold
  `--premium-glow` beside `hsl(11 80% 42%)`, whether 1200px is right on tablet
  landscape, and a re-read of the Aria v22 changelog before any upgrade. Still
  open, and the colour half of it is now [V2-14].

---

## 5. Icebox — explicitly not v1

Carried from `PRD.md` §Future and the PRD sections it cites. Listed so the survey
is complete, not because anything is expected of them.

| Area      | Item                                                                    |
| --------- | ----------------------------------------------------------------------- |
| Sync      | Concurrent multi-device sync + live Realtime updates (premium upgrade)  |
| Sync      | In-app account merge; unlink a sign-in method; magic-link login         |
| Sync      | Drive token-broker (Flow B) — the same Edge Function D7 needs           |
| Storage   | "Empty trash" — ever purging tombstoned rows                            |
| Rendering | Autofit (`PRD-RENDERING` §4.4); columns smart auto-fit                  |
| Rendering | Scrolling / multi-page for over-long songs                              |
| Rendering | Key-aware transpose spelling (v1 is direction-based, ADR-0008)          |
| Rendering | A chord-collision / min-gap spacing setting                             |
| Audience  | D9 — viewer transposes their own copy                                   |
| Audience  | Audience over LAN with no internet                                      |
| Audience  | Host-facing performance history (v1 analytics are developer-only)       |
| Fonts     | woff/woff2 support; a separate chord face                               |
| Security  | Optional passphrase encryption-at-rest                                  |
| Import    | Re-import of downloaded PDFs (PNG already carries its `tEXt` metadata)  |
| Toolchain | D11 — Angular 22, gated on `@ngrx/signals@22` (no release, peers `^21`) |

---

## 6. Outside the app

- **Promotion** (`PROMOTION.md`): ~~Bing is not registered~~ — **it is, and it
  has been audited since** (2026-08-12): sitemaps in, IndexNow validating end to
  end, every technical check passing, and still nothing indexed, because Bing's
  own inspection says _discovered but not crawled_. The standalone
  `https://achordeon.eu/sitemap.xml` is still a dead record in Google Search
  Console since 2026-07-28 — never fetched once, with two fallbacks already
  written down. Six outreach rows are unticked, and the doc's own verdict, now
  confirmed by two consoles, is that one real inbound link is worth more than any
  further technical tuning.
- **Test health.** Unit, re-run 2026-08-13 across the whole workspace:
  **1240/1240 pass** over 91 suites and 6 projects, no debt. (This row first said
  275/27, which was the app project alone; the app is 292 today.) Chromium e2e,
  measured 2026-08-12 and **not re-run since**: **210 pass, 28 fail** of 238
  (`transfer` 11, `songs` 6, `songbooks` 5, `settings` 3, `shell` 2, `editor` 1) —
  so round two's "~30 pre-existing failures" was right, and Epic 12's two
  `shell.spec.ts` fullscreen tests are still among them. Two findings behind it:
  **CI never runs e2e at all** (`deploy.yml` is lint + test + build), and only
  chromium is installed locally, so firefox and webkit report as failures without
  ever launching. Tracked as `V2-BOARD.md` [V2-01].

---

## If something has to be picked

In rough order of value against effort:

1. **The German `B`** (§1.2). It is the only thing on this page that makes the app
   quietly wrong, the fork has a recommendation, and §7's work is mostly deletion.
2. ~~The three title-page variants~~ — **done**: eleven of them, plus the
   rectangle primitive the shaped ones needed. [V2-05].
3. ~~Re-run the e2e suite~~ — **done**: 28 chromium failures, and CI does not run
   the suite at all. Triaging them (they cluster) and wiring e2e into CI is now
   [V2-01], the board's `[now]` card.
4. ~~Reconcile `PRD.md` and `achordeon-implementation.md`~~ (§4) — **done**, and
   it took about the half hour it looked like. [V2-03].
5. **Sharing a slot** (§1.1) — but answer the authored-vs-derived question before
   any code, because it decides whether there is a schema change and a UI at all.
