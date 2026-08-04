# Achordeon — Context Glossary

Ubiquitous language for the Achordeon app. Glossary only — no implementation details.

## One song, one page (core principle)

A Song is meant to render onto a single page/screen with no scrolling while playing — picture a performer at a campfire reading off a phone while holding a guitar. Render settings (scale, columns, aspect ratio) exist to make content fit one page. Scrolling for over-long songs is a possible future option, not the v1 model.

Zoom does not bend this rule: it magnifies a page that already fits, and lays nothing out again.

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

- **Block** — a chunk of the Song (verse, chorus, bridge…). A new Block starts after an empty line. (A Label used to start one too; it no longer does — see Sub-label.)
- **Label** — an optional name at the start of a Block. The **trailing colon is the delimiter** and is consumed; everything before it is the rendered label text. Extra colons let the label text itself contain colons: `1.:` → `1.`, `1::` → `1:`, `1:::` → `1::`. (The label is always rendered — the old "double colon to render" phrasing is incorrect.)
- **Sub-label** — a Label written on a line _inside_ a Block, naming that one line rather than the whole Block: the annotation on a row of chords (`Kl. + Bas: Am F G Am`). Written exactly like a Label, and only the first line of a Block can name the Block, so every later one is a Sub-label. Rendered italic where a Label is bold, at the start of its own line with the line's content after it — so a long Sub-label never indents the rest of the Song.
- **Title** (`* ...`) / **Subtitle** (`** ...`) — print lines, distinct from Song Name. If several exist the last wins (kept as a forgiving rule); the editor shows a warning under all but the effective Title/Subtitle.
- **Chord** — written in square brackets inside lyrics; rendered above the exact character position. Multiple chords in one bracket (space/comma separated) sit over the same character. Bracket content is _validated_ as a chord (root + accidental + quality, optional `/bass`); content that isn't a valid chord (e.g. `[Solo]`, `[x2]`, `[N.C.]`) is rendered literally and never transposed.
- **Inline chord** — a Chord that renders _in_ the line instead of above it, taking its own space in the text. Written with doubled brackets, `[[Am F G]]`. A line with no lyrics has nothing to render a chord above, so its chords are inline whichever way they were written — which is the row of chords a bridge or an intro is made of. Inline chords are set at lyric size where a chord above a lyric is smaller, and are Chords in every other way: same colour, same size setting, transposed and spelled alike.
- **Transpose** — shifts every valid Chord by an interval and **rewrites the source** (mutating, covered by undo/redo). Both the root and the `/bass` note move by the same interval. Spelling follows direction: transposing **up** prefers sharps (A → A#), **down** prefers flats (B → Bb). Key-aware spelling is a possible future refinement.
- **Escape** — a backslash escapes a markup character so it renders literally. Primary need is `:` (so `Narrator:` can be lyric, not a Label); also applies to `*`. `[` escaping is supported by the same mechanism but not considered necessary.

## Songbook

An ordered list of Songs to be filtered/performed together. References Songs by uuid.
One Song may belong to many Songbooks.

- **Entry** — a positioned reference to a Song inside a Songbook. The same Song may appear in multiple entries within one Songbook (e.g. a set that repeats a song). Removing an entry ("remove from songbook") does not delete the Song. (Formerly also called a "slot"; that word now means only the printable region of a sheet — see Slot.)
- **All songs** — the default Songbook; always present. A read-only-order virtual view of the whole library; cannot be reordered and Songs cannot be removed from it.
- **Title-page fields** — a Songbook carries its own Title, Subtitle, and Author, used on the download/print title page. These are Songbook metadata, separate from any Song's Title/Subtitle.

## Delete vs Remove

- **Delete Song** — removes a Song from the library entirely. Only possible from the Songs module. Cascades out of every Songbook. Before deleting, the user is warned the Song is in use, with a link that opens the Songbook and auto-selects the Song.
- **Remove from songbook** — removes a single Entry from a Songbook; the Song stays in the library. Done in the Songbooks module.

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
- _aspect ratio_ — validated text input accepting `N:N`, `N` (float), `N/N`, or `A4`, plus a grouped dropdown of predefined presets: named ratios, paper sizes, named device families, and _Match this screen_.
- _notation_ — English or German note names on the printed page. German spells B natural as `H` and B♭ as `B`. It is a **spelling**, not a reading: the Song's own text is never rewritten, and `[H]` is understood as B natural under either setting. What a stored chord _means_ must not depend on a preference, or the same file would sound different on two devices.

## Aspect ratio

The width:height shape of a single Song's rendered output (image/PDF). A Song-scope setting. Lets the output be cropped to the exact shape of the content to minimize empty space. When printing to a chosen page size (e.g. A4), the Song keeps its aspect ratio but is scaled to fit the page.

A landscape Song is simply one whose aspect ratio is wider than it is tall. There is no separate "landscape" flag: the shape is the setting, and a second way to say the same thing would only raise the question of which one wins.

_Match this screen_ measures the physical screen (`window.screen`) in the orientation the device is currently held, and stores the **reduced exact ratio** it measured — never a "this device" token. The stored value therefore still means the device that was measured after it syncs elsewhere. Device presets carry the same kind of value (the reduced CSS-pixel screen fraction of that family), so a device row and _Match this screen_ agree on the device they both describe.

_Match this screen, sideways_ is the same measurement with the two dimensions swapped: the shape this device would have if it were held the other way round. It saves the reader from having to physically turn the phone before tapping, and it is what makes a Song landscape in the first place.

## Performance view

The shared surface of **Stage** and **Audience**: one Song filling the screen, read rather than edited. One thing seen from two seats, differing on exactly two axes:

- **Who chooses the Song** — in Stage the reader does (prev/next, Summary, swipe). In Audience the performer does, and the choice arrives over the wire; a viewer may open the Summary but cannot open a different Song.
- **Where the Song comes from** — Stage reads the local library. Audience receives the finished render from the Lobby and holds no library of its own.

Everything a reader does to a page they did not author belongs to the Performance view rather than to either seat: **Zoom**, the **dark page**, **Hide chords**, **Turn the page**. Each is device-local and unshared — a view of the page, never a render setting. That is exactly what makes them safe in Audience, where the Song is someone else's and read-only.

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

## Zoom

Looking closer at the rendered page. Available in the Performance view only.

A **view of the page, not a render setting**: it does not cascade (Global → Songbook → Song), never reaches a download, a print or a PDF, and is not part of what an Audience receives — each viewer zooms their own screen, like Hide chords, the dark page and Turn the page. Nothing is laid out again; the finished page is magnified and can be dragged around behind the screen.

- **Fit** — the whole page, the normal state. There is no zooming out past it.
- **Reset on song change** — every page turn starts fitted. A magnification framed one song's chorus and means nothing in the next.
- Zoomed, a drag **pans** and no longer turns the page; the page turn stays on the controls and the arrow keys. Double-tap toggles between fit and a readable magnification at the point tapped.

Not the same word as the Songbook preview's _zoom_, which changes how many pages are shown side by side.

## Turn the page

Reading a landscape page on a device held sideways. Available in the Performance view only.

A **view of the page, not a render setting**, on the same terms as Zoom: the page is drawn a quarter turn round inside its frame, nothing is laid out again, and the download, the print and the Audience payload are untouched. Device-local and unshared.

It exists because the device's own rotation cannot be relied on. A screen with rotation lock on does not follow the phone, so a landscape Song stays a letterboxed strip however the reader holds it — and no browser will unlock the screen on request. The reader turns the page because only the reader knows whether their device will.

Offered only on a screen that can be turned — a phone or a tablet, never a monitor — and that is a question about the **device**, not about how wide the layout is. A tablet held sideways is wide enough to be laid out like a desktop and is still the case this exists for.

The control is a **standing permission, not an act**: it says the reader is willing to hold the device the other way round, and the app then turns the pages that gain by it and leaves the rest upright. So it reads as a mode the way the dark page does — one label, the row lit while it is on — rather than as a button that turns the page in front of you.

Distinct from _aspect ratio_, which decides the page's shape and is the Song's own. A page is landscape because its aspect ratio says so; turning it is how this reader, on this device, then looks at it.

**On paper it is automatic and there is no control.** A sheet can be turned; a monitor cannot. So a printed Song is rotated a quarter whenever rotating gains it area on the paper, without being asked — nobody needs a checkbox for "do not waste half the sheet". The same judgement, offered on screen and simply made on paper, because the reader's body can answer it in one place and not the other.

## Tier

The user's access level. Determines available sync and Audience hosting.

- **No login** — fully offline; sync only by manually downloading/uploading a file. The app never requires login.
- **Free** — logged in but not paying; adds manual Google Drive sync of the library.
- **Premium** — adds automatic sync to Achordeon servers (Supabase) and Audience hosting.

## Account

A single Achordeon identity per user, provider-agnostic. Sign-in is via Google first; email+password registration is planned, and a user may link multiple sign-in methods to the one account. Login is never required for core use — it only adds cross-device sync and Audience hosting.

- **Connect Drive** — authorizing Google Drive as a storage target for sync. A storage authorization layered on the Account — not a separate **account**, but carried by the Google sign-in: connecting Drive on an account without Google links Google as a sign-in method.

## Slot

The printable region of a sheet — the paper minus its margins. What a Song is scaled into when a Songbook is printed.

A slot holds **one Song by default and at most two**. Two Songs in one slot stand side by side as a vertical cut, each keeping its own aspect ratio inside its part of the width.

## Share

How much of a slot's width a Song asks for: `1`, `2/3`, `3/4`, `1/2`, `1/3`, `1/4`. A Song-scope fact — "this song only needs half a page" is true of the song wherever it is printed, so it is not a Songbook setting and imposing a whole book is the printer's job, not the author's.

A share is a **ratio, not a width**. It does two things, and they are separate:

- **Who may pair** — two Songs share a slot only when their shares sum to at most `1`. A `1` therefore never pairs, and that is how a Song says "give me the whole sheet".
- **How the slot splits** — the slot is divided in proportion to the shares of whoever is actually in it. Two halves take half each; a half beside a quarter takes two thirds and a third. A Song that ends up alone in a slot fills it, whatever its share said — a share is permission to be paired, never an instruction to leave paper blank.

Not a render setting: it does not cascade, and it changes nothing about the drawn page. The Song is the same shape it always was; the share only decides how much room it is given.

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
