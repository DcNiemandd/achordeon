# Achordeon — Context Glossary

Ubiquitous language for the Achordeon app. Glossary only — no implementation details.

## One song, one page (core principle)

A Song is meant to render onto a single page/screen with no scrolling while playing — picture a performer at a campfire reading off a phone while holding a guitar. Render settings (scale, columns, aspect ratio) exist to make content fit one page. Scrolling for over-long songs is a possible future option, not the v1 model.

## Song

A single piece of writing: lyrics + chords + render settings. The core entity of the app.

- **Name** — the user's human label for a Song. Unique within the user's library (like a filename). Set by the user at creation, freely editable. Used for finding/listing. Not the same as Title.
- **id (uuid)** — hidden stable internal identifier. Never shown to the user. Used for songbook references and import matching, so renaming a Song never breaks links.
- **Title** — what prints on the rendered sheet, written in content as `* Title`. May be duplicated across Songs. Distinct from Name.
- **Subtitle** — secondary print line (typically author), written as `** Subtitle`.
- **Content** — the source text of a Song, using Achordeon markup syntax (title, subtitle, blocks, chords).
- **Settings (Song scope)** — per-Song render overrides (e.g. scale, columns, title position, aspect ratio).

## PWA

Achordeon is an installable Progressive Web App: it runs offline once installed. (Open question: whether Audience could work over a local network via PWA without internet — over Bluetooth/hotspot it is not feasible.)

## Source of truth

A Song separates **content** (the text: lyrics, chords, titles, subtitles, labels — what the user types, with insert-syntax buttons) from **render settings** (structured metadata edited via GUI panels). Settings are NOT encoded as text directives. Both are bundled into the JSON export. (Editor history is local/session-only — no DB versioning, no diff algorithm.)

## Content syntax

The markup a user types into a Song's content.
Insert-syntax buttons cover: chord, title, subtitle, label, block, markdown bold, markdown italic.

- **Block** — a chunk of the Song (verse, chorus, bridge…). A new Block starts after an empty line or at a Label. A Block containing only chords renders slightly larger (bridge convention).
- **Label** — an optional name at the start of a Block. The **trailing colon is the delimiter** and is consumed; everything before it is the rendered label text. Extra colons let the label text itself contain colons: `1.:` → `1.`, `1::` → `1:`, `1:::` → `1::`. (The label is always rendered — the old "double colon to render" phrasing is incorrect.)
- **Title** (`* ...`) / **Subtitle** (`** ...`) — print lines, distinct from Song Name. If several exist the last wins (kept as a forgiving rule); the editor shows a warning under all but the effective Title/Subtitle.
- **Chord** — written in square brackets inside lyrics; rendered above the exact character position. Multiple chords in one bracket (space/comma separated) form a chord-only line. Bracket content is _validated_ as a chord (root + accidental + quality, optional `/bass`); content that isn't a valid chord (e.g. `[Solo]`, `[x2]`, `[N.C.]`) is rendered literally and never transposed.
- **Transpose** — shifts every valid Chord by an interval and **rewrites the source** (mutating, covered by undo/redo). Both the root and the `/bass` note move by the same interval. Spelling follows direction: transposing **up** prefers sharps (A → A#), **down** prefers flats (B → Bb). Key-aware spelling is a possible future refinement.
- **Escape** — a backslash escapes a markup character so it renders literally. Primary need is `:` (so `Narrator:` can be lyric, not a Label); also applies to `*`. `[` escaping is supported by the same mechanism but not considered necessary.

## Songbook

An ordered list of Songs to be filtered/performed together. References Songs by uuid.
One Song may belong to many Songbooks.

- **Entry (slot)** — a positioned reference to a Song inside a Songbook. The same Song may appear in multiple slots within one Songbook (e.g. a set that repeats a song). Removing a slot ("remove from songbook") does not delete the Song.
- **All songs** — the default Songbook; always present. A read-only-order virtual view of the whole library; cannot be reordered and Songs cannot be removed from it.
- **Title-page fields** — a Songbook carries its own Title, Subtitle, and Author, used on the download/print title page. These are Songbook metadata, separate from any Song's Title/Subtitle.

## Delete vs Remove

- **Delete Song** — removes a Song from the library entirely. Only possible from the Songs module. Cascades out of every Songbook. Before deleting, the user is warned the Song is in use, with a link that opens the Songbook and auto-selects the Song.
- **Remove from songbook** — removes a single Entry/slot from a Songbook; the Song stays in the library. Done in the Songbooks module.

## Song explorer

The rich Song-list component: search, sort (name / created / changed / favorite), multi-select, bulk actions, and row actions. Used in the Songs module (full power) and the Songbooks left panel (identity/destructive actions like delete, rename, duplicate, edit disabled; search, sort, select, favorite, and add-to-songbook stay). One component, capability set per context.

## Summary list

A separate compact list with search only, used in Stage and Audience. Not the Song explorer. In Stage, tapping opens a Song; in Audience it is read-only.

## Search

Two-tier: a fast query over a Song's metadata (Title, Subtitle) first, then a slower query over lyrics/content. Title/Subtitle matches are prioritized over content matches.

## Favorite

A global per-Song flag (the same everywhere the Song appears). Sortable in the Song explorer.

## Import dialog

A table/form for resolving an import (not the Song explorer).

## Render settings

Settings that change how a Song is rendered to output. They cascade across three scopes ordered least-to-most specific: **Global → Songbook → Song**. Every setting has a Global default; a Songbook and/or a Song may override it. When more than one scope sets the same setting, **the most specific scope wins** (Song over Songbook over Global). The effective value is always resolved at render time, never stored.

- **Global scope** — the base default value for every render setting.
- **Songbook scope** — overrides applied to every Song performed within that Songbook (a per-book theme).
- **Song scope** — overrides carried by the Song itself, wherever it appears.

Which scopes a given setting may be overridden at is a configurable property of that setting, not a fixed rule — a setting may be overridable at the Song scope, the Songbook scope, or both. Illustrative assignment: scale, columns, title position, aspect ratio (Song); chord color, chord size, font (Songbook, and optionally Song too).

- _columns_ — author-set count (future: smart auto-fit).
- _title position_ — top, or left side as a sideways (rotated) spine. A companion _title layout_ choice stacks the subtitle under the title or sets it inline beside it. The title block always sits at the top-left corner.
- _aspect ratio_ — validated text input accepting `N:N`, `N` (float), `N/N`, or `A4`, plus a dropdown of predefined presets.

## Aspect ratio

The width:height shape of a single Song's rendered output (image/PDF). A Song-scope setting. Lets the output be cropped to the exact shape of the content to minimize empty space. When printing to a chosen page size (e.g. A4), the Song keeps its aspect ratio but is scaled to fit the page.

## Stage

Performing mode for a selected Songbook. Its own nav module: pick a Songbook, then perform (a "Perform" shortcut from the Songbooks module is also assumed). Shows one Song at a time with prev/next, Summary, swipe navigation, and Fullscreen (tap toggles the navbar, swipe navigates — no dedicated tap zone).

- An empty Songbook cannot be performed. A single-Song Songbook has prev/next disabled.

## Audience

Viewers who join a performer's session via a lobby PIN / QR code and follow along.

- **Lobby** — a session a performer opens that Audience members join, identified by a ~5-character PIN. Audience needs an internet connection (no account). The QR code encodes a URL to the Audience module carrying the PIN.
- **Join** — anyone can join an Audience (no tier required).
- **Hide chords (Audience)** — a viewer-local toggle that hides chord glyphs but keeps their reserved space, so layout does not reflow. The performer always shares chords; this is a client-side preference, not a different render.
- **Host / create** — opening a Lobby. Premium-only in the long run; extended to Free users during the testing phase, and will become Premium-only after testing or once the userbase grows.

Mental model: one performer picks the Songs; everyone around (the Audience, each on their own device) sees the currently selected Song. Audience receives the full render exactly as the performer sees it, plus the read-only setlist (Summary). Only the selected Song syncs; Audience can view the Summary but cannot open a different Song. A Lobby is one-time and ends when the performer ends it.

## Tier

The user's access level. Determines available sync and Audience hosting.

- **No login** — fully offline; sync only by manually downloading/uploading a file. The app never requires login.
- **Free** — logged in but not paying; adds manual Google Drive sync of the library.
- **Premium** — adds automatic sync to Achordeon servers (Supabase) and Audience hosting.

## Account

A single Achordeon identity per user, provider-agnostic. Sign-in is via Google first; email+password registration is planned, and a user may link multiple sign-in methods to the one account. Login is never required for core use — it only adds cross-device sync and Audience hosting.

- **Connect Drive** — authorizing Google Drive as a storage target for sync. A storage connection layered on the Account, not a separate identity.

## Export

Producing a JSON file — a small database of Songs/Songbooks "for computers": moving data between machines, human-editable in a text editor. The canonical round-trip format.

## Download

Producing an output "for players" (playing, printing, sharing).

- **Song download** — PDF or an image format (PNG; rendered cross-browser via the SVG renderer). Multiple songs: a ZIP of images, or PDF (single or multi-page via a switch).
- **Songbook download** — a PDF (see Songbook download options).

## Import / re-import

Bringing Songs/Songbooks back in.

- Accepts Exported (JSON) files and, as a nice-to-have, **Downloaded** files that still carry their embedded metadata. Re-import of downloads is a QOL "more backups for the user" feature — counted on but may be dropped if costly. Editing a downloaded file can strip its metadata, breaking re-import.
- **Song import conflict** — import a Song if missing; on conflict the user chooses to keep the existing one or re-import the incoming one under a different uuid/name (replace / ignore / create-new).
- **Songbook import** — always creates a new Songbook, even on name collision.

## Premium highlight

A small visual marker shown throughout the app on features that are (or will become) Premium-only, with a tooltip such as "Premium feature available for testing," so users can see what paying would unlock.
