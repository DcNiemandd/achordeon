# 6. Data-driven settings with a uniform Global→Songbook→Song cascade

Date: 2026-06-28

## Status

Accepted

## Context

Render settings (scale, columns, title position, aspect ratio, chord color, chord
size, font, …) live at more than one scope. They are read by the renderer for the
on-screen view, PNG/PDF export, and the Audience render, and they are persisted on
the `Song` and `Songbook` records plus a `Global` default — so their shape is hard to
change once stores, migrations, and the export format exist.

`CONTEXT.md` originally asserted a simplifying invariant: _every setting is
overridable at exactly one further scope (never both), so there is no three-way
conflict._ That made the override key-sets disjoint and the merge order-independent.
The invariant turned out to be wrong for the product: a setting like `chordColor`
plausibly belongs at **both** Song and Songbook scope, and we did not want to fix the
per-setting scope assignment now — it must stay cheap to change and to extend with new
settings later.

### Options

- **A — Hand-written split types, one override scope per setting.** `SongSettings` and
  `SongbookSettings` as separate interfaces with disjoint keys; merge is
  `{...global, ...songbook, ...song}` and order doesn't matter because nothing
  overlaps. Simple, but bakes the partition into code: moving or adding a setting edits
  types **+** merge **+** validation **+** the GUI panels, and a setting can never live
  at two scopes.

- **B — Data-driven registry, uniform cascade.** A single `SETTINGS` table is the
  source of truth; each row declares a setting's default and the scopes it may be
  overridden at (any subset). Per-scope types, the merge, and validation are all
  **derived** from that table. Scopes form one ordered cascade
  `Global → Songbook → Song`; resolution is per-key "most specific defined value
  wins". Costs: a tiny bit of type-level machinery (mapped types over the registry),
  and giving up the "no three-way conflict" guarantee in favour of a real precedence
  order.

## Decision

Adopt **Option B**.

- **One registry is the single source of truth.** Each setting is one row:
  `{ default, scopes }` (plus its value type/validator). Adding a setting = add a row;
  moving a setting between scopes = edit its `scopes` array. Nothing else changes by
  hand.
- **Per-scope types are derived, not authored.** `SongSettings` / `SongbookSettings`
  are mapped types computed from the registry, so the compile-time guarantee "a Song
  cannot set a Songbook-only key" survives without hand-maintained interfaces.
- **Uniform cascade `Global → Songbook → Song`, most specific wins.** When a key is set
  at more than one scope, the **Song** value beats the **Songbook** value beats the
  **Global** default — the conventional "more local declaration wins" rule (CSS, env
  layers), applied identically to every setting with no per-setting special cases.
  Resolution is `song[k] ?? songbook[k] ?? global[k]`.
- **Settings are stored sparse; the effective value is never persisted.** An entity
  holds only the keys it actually overrides (absence = inherit; "reset to default" =
  delete the key). The effective settings are computed at render time, so changing a
  Global default instantly reflows every non-overriding Song.

The resolver and registry live in `shared/domain`. The field-level shapes live in
`docs/PRD-DOMAIN-MODEL.md`; `CONTEXT.md` carries the cascade rule as ubiquitous
language.

## Consequences

- The earlier "exactly one override scope / no three-way conflict" invariant in
  `CONTEXT.md` is **retired**. The replacement is a deliberate precedence order rather
  than a structural impossibility.
- A Songbook scope can no longer force-theme a Song that sets the same key itself —
  the Song wins. A future "force book theme" override would be a deliberate new
  feature, not the default.
- Because the same Song resolves against whichever Songbook it is performed in, one
  Song can render differently per book for any Songbook-scoped key — by design.
- The export/import and Supabase shapes must carry settings as sparse partials per
  entity, and `schemaVersion` must account for the registry growing over time.
