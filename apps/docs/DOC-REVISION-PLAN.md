# Achordeon — Documentation Revision Plan

Output of a doc-grilling session. Resolved decisions are captured in `/CONTEXT.md` (glossary).
This file lists the concrete documentation changes to make, per file, plus the data model and open decisions.

## Data model (as resolved)

- **Song**: hidden `uuid` (refs/import key, never shown) + unique `name` (human label, set at creation, editable) + `title` (`*`, prints, dup allowed) + `subtitle` (`**`) + `content` + Song-scope settings + global `favorite` flag.
- **Songbook**: ordered list of **entries/slots** referencing Songs by uuid; same Song may appear in multiple slots; own title-page fields **title + subtitle + author**; Songbook-scope settings. "All songs" = virtual, read-only-order.
- **Render settings**: Global = base for all. Song-scope: scale, columns, title position, aspect ratio. Songbook-scope: chord color, chord size, font. Each setting overridable at exactly one scope (no 3-way).
- **Account**: one provider-agnostic Achordeon identity (Google first; email/pw + linking future). Drive = connectable storage. Tiers: no-login (file sync) / free (Drive sync) / premium (Supabase auto-sync + Audience hosting).

## Per-file doc changes

### intro.mdx

- Fine. (Optional: one line that the app is offline-first, login optional.)
- **Add a PWA section**: app is installable, runs offline once installed — currently documented nowhere and genuinely useful to users.

### basics.mdx

- Resolve nav-icon `:::danger`. Define mobile popup menu behavior.
- Add the **"one song, one page, no scroll while playing"** core principle up front (campfire mental model).

### songs/index.mdx

- Reword "unique identifier (ID)" → "unique **name**"; drop developer ID framing. Note create flow: New → enter name → opens editing.
- Document **delete warning**: when deleting a Song in use, warn + link that opens the Songbook and auto-selects the Song. Delete is Songs-module only.
- Clarify the two list types (Song explorer here; Summary list elsewhere).

### songs/editing.mdx

- Note chord color/size in the editor preview = **Global** default (Songbook restyling not visible here).
- Define **valid chord** = root + accidental + quality + optional `/bass`; non-chord brackets render literal.
- Define **transpose**: mutates source (undo/redo covers it), moves root AND `/bass`, up→sharps / down→flats. (POC transpose currently buggy — fix in impl.)
- Resolve `:::danger` (implement shortcuts + settings). Note undo/redo is session-only — confirm intended.
- **Decide & write ADR**: data-in-source vs data-in-metadata (the "UNSTABLE source of truth").

### songs/syntax.mdx

- **Rewrite the Label section** (current "double colon to render" is WRONG): trailing colon is the delimiter, the rest is the rendered label; extra colons embed literal colons (`1.:`→`1.`, `1::`→`1:`, `1:::`→`1::`). Add image/code-block with descriptions.
- Add **escape** section: backslash escapes markup; primary use `:` (so `Narrator:` stays lyric), also `*`; `[` covered but unneeded.
- Note non-chord brackets render literally.
- Note multiple titles = current impl (last wins); future = validate single title.

### songbooks/index.mdx

- Document **remove-from-songbook** (slot removal, Songbooks module) vs delete (Songs module).
- Document **duplicate slots allowed**, "All songs" read-only-order.
- Document **title-page fields** = title + subtitle + author (Songbook-level, distinct from Song fields).
- Songbook-scope render settings (chord color/size/font) apply to all Songs in the book.

### stage-audience.mdx

- Fix offline/cost contradiction (reference the access-model one-liner).
- **Audience model**: campfire — performer picks Songs, everyone on own devices sees the selected Song (full render as performer) + read-only Summary/setlist; only selected Song syncs; can't open other Songs; lobby one-time, ends with performer.
- Join = anyone; **host = premium** (free during testing; premium-only after).
- **Stage**: own module, pick Songbook then perform (+ optional Perform shortcut from Songbooks). Empty songbook can't be performed; single-Song book disables prev/next. Fullscreen: tap toggles navbar, swipe navigates, no dedicated zone.

### export-import.mdx

- List download formats explicitly: **PDF + image (PNG; Chromium-only in POC)**. Multiple songs → ZIP of images, or PDF (single/multi via switch). Songbook → PDF.
- Mark **re-import of downloaded files** as a nice-to-have (embedded metadata, "max backups" goal, may be cut).
- Import conflict: keep existing or re-import incoming under new uuid/name (replace/ignore/create-new). Songbook import always creates new.

### settings.mdx

- Restructure as **Today (testing) vs Planned**, clearly labeled.
- Fix offline+login contradiction: app works fully offline, never requires login; login only adds cross-device sync + Audience hosting.
- **Account** model: single identity, providers, Drive as connectable storage.
- **Tiers** table: no-login / free / premium with exact capabilities.
- **Premium highlight**: document the in-app marker for (future) premium features.
- Resolve TODO stubs: rendering settings (point to the partition model), language EN/CS, custom shortcuts, theme.

## Resolved since first draft

- Stage entry: own module + Perform shortcut. CONFIRMED.
- Audience hide-chords: viewer-local toggle, hides glyphs but keeps space (no reflow, not a separate render). CONFIRMED.
- Editor history: local/session only — no DB versioning, no diff algorithm. CONFIRMED.
- Sync conflict: Supabase = newer version wins (last-write-wins by timestamp). Drive = likely reuse the import flow (replace/ignore/create-new). Tentative.

## Resolved (round 2)

- **Source of truth = Option B** (content in text, render settings in metadata). See `docs/adr/0001`.
- Drive sync conflict: reuse import flow. Supabase: newer wins.
- **PWA**: app is an installable, offline PWA — DOCUMENT this (currently mentioned nowhere). Open: local-network Audience over PWA without internet?
- Mobile nav: hamburger toggles the navbar.
- Language: UI only (does not touch song content/render).
- Insert-syntax buttons: chord, title, subtitle, label, block, markdown bold, markdown italic.
- Title position: top, or left side as separate column/row.
- Columns: author-set (future smart auto-fit).
- Multiple titles: keep last-wins; editor warns under all non-effective titles.
- Aspect ratio input: validated text (`N:N`, `N` float, `N/N`, `A4`) + preset dropdown.
- Lobby: backend array; ~5-char PIN, dedup on generate; QR = URL to Audience module + PIN; Audience needs internet, no account.
- Premium highlight: small visual + tooltip "Premium feature available for testing."
- Theme/colors + custom shortcuts: TBD / designer-dependent.

## Still genuinely open

1. Local-network Audience over PWA without internet — research.
2. Custom shortcuts — keymap + config UI (TBD).
3. Theme colors — pending design.
