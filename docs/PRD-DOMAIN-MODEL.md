# Achordeon — Domain Model PRD (shared/domain)

Field-level shapes for the `shared/domain` scope — the entity types and pure
functions every feature depends on. Complements `CONTEXT.md` (glossary, no code) and
`PRD-INFRASTRUCTURE.md` §1/§4 (Snapshot envelope, persistence). Types are illustrative
TypeScript; the binding contract is the prose around them.

> Status: living. Settled here: base record, Song, Songbook + entries, the settings
> model (ADR-0006). Open: Snapshot/`schemaVersion` + migrations, transpose spelling
> (D2).

---

## Base record

Every persisted entity carries the same envelope (per `PRD-INFRASTRUCTURE.md` §1/§4:
stable client uuid, timestamps, soft-delete tombstone — nothing is ever hard-deleted).

```ts
type Uuid = string;

interface BaseRecord {
  id: Uuid; // stable, client-generated; survives rename
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms; bumped on every meaningful change
  deletedAt: number | null; // tombstone; null = live. Lists filter out non-null.
}
```

---

## Song

```ts
interface Song extends BaseRecord {
  name: string; // library label (find/list); unique-ish, freely editable. ≠ Title.
  content: string; // source text — Title (* …), Subtitle (** …), blocks, chords all live here
  favorite: boolean; // global per-song flag, sortable
  settings: SongSettings; // sparse render overrides (see Settings model)
  cache: SongCache; // DERIVED — see below
}

/**
 * Parser cache. NOT authored. Rewritten from `content` by the parser on every save
 * (the editor save path owns the write; the parser itself stays pure). A materialized
 * view of `content`, kept so two-tier search and Title-based queries never have to
 * parse the whole library. Safe to drop and rebuild; on import it is regenerated.
 */
interface SongCache {
  title: string; // effective Title resolved from content ("last wins")
  subtitle: string; // effective Subtitle resolved from content
}
```

- **Title/Subtitle are parsed from `content`**, never stored as authored fields; `cache`
  is the only place their resolved values are persisted, explicitly as a cache.
- **Search** (`CONTEXT.md` §Search) hits `cache.title` / `cache.subtitle` for the fast
  tier and `content` for the slow tier. Both IndexedDB and Supabase can index the cache.

---

## Songbook

```ts
interface Songbook extends BaseRecord {
  name: string; // library label
  title: string; // title-page fields — AUTHORED via GUI, not parsed
  subtitle: string;
  author: string;
  settings: SongbookSettings; // sparse render overrides (see Settings model)
  entries: Uuid[]; // ordered Song references; a songId MAY repeat (a "slot")
}
```

- **`entries` is a plain ordered array of song uuids.** Position is the array index — not
  a stored field, so reorder is "replace the array" with no reindex churn. The same
  `songId` may appear more than once (a set that repeats a song); slots are addressed by
  index. There is no per-slot id and no per-slot state.
- **Maps to Supabase** `songbook_songs(songbook_id, song_id, position)` on push (index →
  `position`) and reassembles to the array on pull — a sync mapping concern, not part of
  the domain shape. The Snapshot envelope keeps entries embedded inside `songbooks[]`.
- **"All songs" is virtual** (`CONTEXT.md`) — a synthesized read-only view of the whole
  library, never a stored `Songbook` and never an `entries` list.

### Known v1 limitation — repeated song, single key

Both slots of a repeated song point at the same `songId`, and transpose rewrites the
shared `content`, so repeats always render in the **same key**. Wanting a second key =
duplicate the Song. Accepted for v1.

> Future (parked): **Audience local transpose** — a viewer transposing their own copy.
> Needs its own exploration (e.g. "transpose all songs in the lobby?" vs "remember this
> song's transpose for this lobby?"). Tracked in `PRD.md`.

---

## Settings model (see ADR-0006)

Render settings cascade `Global → Songbook → Song` (least → most specific); **most
specific defined value wins**, uniformly, for every setting. The scope assignment is
**data**, not hand-written types.

### One registry — the single source of truth

```ts
const SCOPES = ['global', 'songbook', 'song'] as const; // ordered least → most specific
type Scope = (typeof SCOPES)[number];

// One row per setting. Adding a setting = add a row; moving scopes = edit `scopes`.
const SETTINGS = {
  scale: { default: 'auto', scopes: ['song'] }, // uniform content-box→render-box fit; 'auto' = max fit, number = manual (may overflow). See PRD-RENDERING §4.1
  columns: { default: 1, scopes: ['song'] },
  titlePosition: { default: 'top', scopes: ['song'] }, // 'top' | 'left' (CCW spine). See PRD-RENDERING §4.5
  titleLayout: { default: 'stacked', scopes: ['song'] }, // 'stacked' | 'inline' subtitle vs title; orthogonal to titlePosition. See PRD-RENDERING §4.5
  titleFont: { default: 'body', scopes: ['songbook', 'song'] }, // the face for Title AND Subtitle together — one title block, one decision. 'body' = the song's own font. Names a catalog choice, not a family. See PRD-RENDERING §4.10
  aspectRatio: { default: 'A4', scopes: ['song'] },
  padding: { default: 0.5, scopes: ['song'] }, // blank border inside the render box, in em. An INSET, so it never bends the aspect ratio; the songbook's print margin ADDS to it rather than overriding, which is why there is no 'songbook' scope. See PRD-RENDERING §4.11 / §6
  chordColor: { default: '#9f1212', scopes: ['songbook', 'song'] },
  chordSize: { default: 1, scopes: ['song'] },
  font: { default: 'serif', scopes: ['songbook', 'song'] },
} satisfies Record<string, SettingDef>;
```

**Parked settings (noted, not built):**

- **`font`** — the body face; the row above is a placeholder. v1 ships one bundled
  font, so it is commented out in code (`titleFont` is the one font choice that _is_
  live). See PRD-RENDERING §4.10.
- **`notation`** (`german | english`, default `english`; `scopes: ['songbook','song']`)
  — chord-symbol notation. English is the engine today, already extended so the
  German **`H`** reads as B natural (the mixed convention). The setting is what a
  full switch needs, because it changes what existing symbols mean: **strict German**
  (`B` = B♭), the **solfège** spellings (`Cis`/`Des`/`As`/`Es`), and German transpose
  **output** (re-spell B natural back to `H`). Flipping any of these silently would
  break every English song, which is why it is a choice, not a default. See
  `PARSER-GRAMMAR.md` §Notation.

`SettingDef` carries, alongside `default` + `scopes`, a **value-type / editor kind**:

- **`select`** (must-select) — a fixed option set; dropdown only (e.g. `titlePosition`).
- **`select-or-custom`** (custom-or-options) — preset dropdown **plus** validated free input
  (e.g. `aspectRatio`: presets + custom `N:N` / `N/N` / float / `A4`).
- plain scalars (number, color, …) for the rest.

The editor kind drives the GUI control and the validator; it does not affect storage —
every setting persists as a plain value in the sparse `settings` bag regardless of kind.

### Types are derived, not authored

```ts
// Only keys whose registry `scopes` include S; all optional (sparse).
type SettingsFor<S extends Scope> = {
  [K in keyof typeof SETTINGS as S extends (typeof SETTINGS)[K]['scopes'][number] ? K : never]?: ValueOf<K>;
};

type GlobalSettings = { [K in keyof typeof SETTINGS]: ValueOf<K> }; // complete
type SongSettings = SettingsFor<'song'>;
type SongbookSettings = SettingsFor<'songbook'>;
```

The compiler enforces "a Song cannot set a Songbook-only key" without any hand-kept
interfaces.

### Resolution

```ts
// Per key, most specific defined value wins. Stored sparse; effective value never persisted.
function resolveSettings(global: GlobalSettings, song?: SongSettings, songbook?: SongbookSettings): GlobalSettings; // for each key K: song?.[K] ?? songbook?.[K] ?? global[K]
```

- **Sparse storage** — an entity holds only the keys it overrides; absence = inherit,
  "reset to default" = delete the key.
- **Never persist the effective result** — compute at render, so a Global change reflows
  every non-overriding Song for free.
- The same Song resolves against whichever Songbook it is performed in, so one Song can
  render differently per book for any Songbook-scoped key — by design.

---

## Model evolution (see ADR-0007)

`schemaVersion` (logical) + a forward-only pure-migrator chain behind one ingest gateway;
Dexie `.version()` for physical stores/indexes only; additive changes need no bump and are
kept lossless by a **preserve-unknown** discipline (patch records in place, never rebuild
from known keys; the store holds full records); breaking bumps refuse-and-prompt-to-update.

## Transpose (D2, see ADR-0008)

Transpose shifts every valid chord by `±N` semitones (sign = direction) and **rewrites the
source** (destructive, undo/redo via editor history — no stored offset on `Song`). Spelling
is **direction-based**: a fixed table per direction, not tonal's interval-transpose (which
leaks `E#`/`B#`/double-accidentals).

```ts
// shared/domain — pure policy; ChordTheory port passed in (testable without DI)
function transposeContent(content: string, semitones: number, theory: ChordTheory): string;

const UP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DOWN = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
```

Per valid chord: parse → `{ root, bass, quality }` (via `ChordTheory`), shift `root` and
`/bass` by `±N` chroma `mod 12`, spell from `UP`/`DOWN`, reassemble `root + quality +
("/" + bass)`. Quality preserved verbatim; `root` and `/bass` move by the same interval;
invalid-as-annotation brackets (`[Solo]`, `[x2]`, `[N.C.]`) are skipped; double-accidental
input is normalised to the table. Reuses the parser's chord sub-grammar — one chord
recogniser, not an AST transform. Key-aware spelling is a future refinement.

### Music-theory seam (ADR-0008)

```ts
// shared/domain — port (pure, no tonal); abstract class = DI token + type
abstract class ChordTheory {
  abstract parseChord(text: string): ParsedChord | null; // null = not a valid chord
  abstract noteChroma(note: string): number | null; // pitch-class 0..11
}
interface ParsedChord {
  root: string;
  bass: string | null;
  quality: string;
}
```

`TonalChordTheory` (in `shared/data-access`) is the only file importing `@tonaljs/*`;
provided via `{ provide: ChordTheory, useClass: TonalChordTheory }`. `ParserService`
(validity) and `TransposeService` both inject the port. Tested with a fake `ChordTheory`
(pure core) + a contract suite every implementation must pass (so a future custom engine
swaps in provably).
