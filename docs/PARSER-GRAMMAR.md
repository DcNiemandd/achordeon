# Achordeon — Parser Grammar Spec

> Status: **core grammar decided.** Editor choice decided (CodeMirror 6, ADR-0010);
> transpose/rendering details deferred to their own docs. The precise,
> machine-level grammar for
> `ParserService`. This is the _parsing_ layer (content text → AST), **not** the
> rendering layer (SVG layout/`measureText`, deferred) and **not** the shallow
> service contract (that lives in `PRD-INFRASTRUCTURE.md` §12).
>
> `apps/docs/docs/songs/syntax.mdx` is the human-facing syntax doc; this file is
> its exact counterpart for implementers. Where they ever disagree, fix one of
> them — they must stay consistent.

Repo-root `docs/`, not the published Docusaurus site.

---

## Foundations (from PRD §12 — decided)

- **Pure semantic AST.** String in, plain object out. No font, DOM, or canvas
  dependency; no geometry. Chords anchor to a **character index** into a line's
  text — the renderer turns that into a pixel x via `measureText`.
- **Single effective title / subtitle.** The model carries one `title` and one
  `subtitle` (not arrays). "Last wins"; shadowed ones become warnings.
- **Render options are not parsed from text** (ADR-0001) — they live in metadata.
- **Two-phase, line-oriented:**
  - **Phase 1 — line classification & blocking.** Split into lines, classify each,
    group into blocks.
  - **Phase 2 — inline scan ("the tokenizer").** Runs only over the content portion
    of content lines: chords `[…]`, escapes `\`, future markdown.

### AST shape (working sketch)

```
Song {
  title?:    string          // effective (last wins)
  subtitle?: string          // effective (last wins)
  blocks:    Block[]
  warnings:  Warning[]        // shadowed titles, invalid chords, … (TBD)
}
Block {
  label?:       string       // rendered label text (delimiter colon consumed)
  labelInline?: boolean       // true: label shared its source line with the first
                             // content line; false/absent: label stood alone and
                             // the body starts on the next line. Render-significant
                             // (see "Rendering notes").
  lines:        Line[]
}
Line {
  label?: string             // SUB-label: a labelled line that did not open the block
  text:   string             // final rendered chars (brackets removed, escapes resolved)
  chords: ChordAnchor[]      // overlay by index; spans?: Span[] later (markdown)
}
ChordAnchor {
  raw:    string             // bracket content as written; rendered verbatim
  at:     number             // index into `text` (char the anchor sits above)
  valid:  boolean            // true = transposable chord; false = verbatim annotation
  inline?: boolean           // written `[[…]]`: renders IN the line, not above it
}
```

---

## Phase 1 — line classification

Each line is classified as exactly one type. Precedence (first match wins):
**Blank → Subtitle → Title → Labelled content → Lyric.** _Chord-only_ is **not** a
line type — it is a property a content line acquires in Phase 2 once all its runs
are chords.

### Title / Subtitle (the asterisk rule) [decided]

- **Marker at column 0 _and_ followed by a space.** `* x` = Title, `** x` =
  Subtitle. `*bold*`, `***whoa***`, `*x` (no space) are **not** title/subtitle —
  they fall through to Lyric, where Phase-2 markdown owns `*`. The space
  requirement is what keeps `***` out of this branch with no special case.
- **Longest match: test `**`before`_`** so a subtitle never reads as a title
with a `_`-prefixed body.
- **Bodies are plain print text — no inline parsing.** The marker wins over the
  whole rest of the line: `* Song: Live [Acoustic]` is a Title literally reading
  `Song: Live [Acoustic]` — the colon is not a label, the brackets are not a
  chord, no escapes are processed.
- **Last wins → single effective value.** Multiple `*` lines: the last is the
  effective title; earlier ones emit a warning. Same for `**`.
- **Empty body** (`* ` then nothing/whitespace) → **treated as absent**: no value
  set, no warning (avoids silently clearing the title mid-keystroke).

### Labelled content (the colon-run rule) [decided]

A content line is **Labelled** iff, scanning from column 0, there is a **first
unescaped colon-run immediately followed by a space or end-of-line**. That run's
**last colon is the delimiter** (consumed); the run's earlier colons remain as
literal label text.

- **Label text** = everything before the run **+** (runLength − 1) literal colons.
  Label text is **plain** (no chord/inline parsing), like titles.
- **Content** = everything after the delimiter, with exactly **one** following
  space consumed; this remainder becomes the block's **first content line** and is
  inline-parsed normally (Phase 2).
- **A colon not followed by space-or-EOL is not a delimiter** → ordinary lyric.
  So `http://x`, `12:30` are plain lyrics and need no escaping; only a colon-run
  that ends in space/EOL is a label.
- **`\:` never counts** toward a delimiter.
- **Empty label text → not a label** (`: foo` is a plain lyric, leading `:`
  literal). An empty label is meaningless.

| Line               | Label      | First content-line text |
| ------------------ | ---------- | ----------------------- |
| `1.: First verse`  | `1.`       | `First verse`           |
| `R:: Block X`      | `R:`       | `Block X`               |
| `1:::`             | `1::`      | _(empty)_               |
| `2.: And [C]trade` | `2.`       | `And [C]trade`          |
| `Narrator: hi`     | `Narrator` | `hi`                    |
| `http://x`         | _(none)_   | lyric `http://x`        |
| `: foo`            | _(none)_   | lyric `: foo`           |

**Footgun:** `Narrator: hi` silently becomes a label. Accepted: the rule stays
uniform; `\:` is the escape and the editor surfaces a warning (error model — TBD).
No "looks like a label" heuristic (e.g. forbidding spaces in label text) — it would
kill legitimate multi-word labels like `Chorus 2:`.

### Block boundaries [decided]

1. **Blank line = boundary.** A line that is empty _or whitespace-only_ separates
   blocks. **Consecutive blanks collapse** to one boundary; leading/trailing blanks
   are ignored; **no empty blocks are emitted.** Blocks never contain interior
   blanks (a blank already closed the block).
2. **A labelled line starts a new block only when no block is open** [decided].
   Opening one, it becomes the block's `label`, and its post-delimiter content
   becomes the block's first content line **only if non-empty**. **Inside an open
   block it is a sub-label** on a line of its own (`Line.label`), carrying its
   post-delimiter content as that line's text.
   - So a label no longer implies a gap: `Intro:` followed by `Kl. + Bas: …` and
     `Housle: …` is **one** block with two annotated rows. A blank line is how you
     ask for the next block, which is the same rule as everywhere else.
   - **Only the line that OPENS a block can name it.** A label after a bare lyric
     line is subordinate — the block already started without one, and a block label
     renders above or beside the block as a whole.
   - Reversing the old rule changes how existing text renders: two adjacent
     labelled lines used to be two blocks with a gap between them. Recovering the
     gap is one blank line.
3. **Consecutive unlabelled non-blank lines** stay in the **same** block.
4. **Title/Subtitle lines are boundaries** (decision ii): a `*`/`**` line is lifted
   to song-level _and_ separates blocks. It is neither blank nor content, so it
   never lives inside a block and never welds two blocks together.
5. **A content line's leading whitespace is stripped [decided].** The pass ends by
   trimming leading `[ \t]` from every content line — bare lyric and post-delimiter
   labelled content alike (`Verse:  x` and `Verse: x` become the same). It is
   almost always the editor's accidental indent (a tabbed lyric, a pasted block),
   and left in it shoved the line right and pulled every chord off its character
   (anchors are indices into this text, §Line model). A **deliberate** leading
   space is kept with the `\ ` escape: the strip is a `[ \t]` run so it stops at
   the backslash, and Phase 2 resolves `\ ` to a bare space. **Only leading**
   whitespace, and **only content lines** — interior spacing is significant
   (it spaces the chords of a chord row, alignment) and is preserved; title/subtitle bodies
   are left as typed (they carry no escapes and are positional). Trailing
   whitespace is left untouched.
6. **A block may have a label with zero content lines** (label-only, e.g. `Verse:`
   at EOF). Otherwise every block has ≥1 content line; no synthesized empty lines.

**Label position is preserved (`labelInline`).** `Verse: foo` (content on the label
line) and `Verse:` ⏎ `foo` (content on the next line) produce the _same_ label and
lines but differ in `labelInline` — the parser records which, because they render
differently (one rendered line vs two; see Rendering notes).

---

## Phase 2 — inline scan ("the tokenizer")

Runs only over the content portion of content lines (lyric lines and the content
of labelled lines). Title/Subtitle/label-text are plain and never reach here.

### Line model + chords [decided]

A line is held as **overlay-by-index** — a clean `text` string with chords floating
over it by character index — not interleaved runs. This _is_ the "chord above the
exact character" model; the renderer gets the x from `measureText(text.slice(0, at))`.

1. **Anchor = the character immediately _after_ the closing bracket**
   (chord-over-next-char). `tr[C]ade` → `text:"trade"`, `C` at `2`. A bracket at
   end-of-line anchors at `text.length` (renderer places it at the end).
2. **Every unescaped `[…]` is an above-line anchor.** Literal inline brackets in a
   lyric require the `\[` escape.
3. **Multiple chords in one bracket** split on spaces/commas → multiple anchors **at
   the same index**, in order; each validated independently. A line whose `text` is
   empty/whitespace but carries chords renders those chords **in** the line rather
   than above it (a render property, not a parse type — see "Rendering notes").
4. **Invalid bracket = annotation, not literal text** (decision Q). `[Solo]`,
   `[x2]`, `[N.C.]` still become anchors (`parsed: null`), rendered **verbatim** and
   never transposed — they float above like a chord, matching real chord-sheet
   convention. Validity only decides transposable-vs-verbatim; truly literal
   brackets are the `\[` case.
5. **A doubled bracket `[[…]]` is an INLINE chord group** [decided]. Same tokens,
   same anchor index, same validity rule — the one difference is that its chords
   render **in** the line rather than above it (see "Rendering notes"). Content runs
   to the first unescaped `]]`, so a lone `]` inside one is just a character.
   - **Unterminated `[[` is not an error.** The first `[` becomes literal text and
     the scan resumes after it, which is the lone-`[` rule one level up: `[[C]`
     reads as a literal `[` plus an ordinary chord. Keeps the parser total.
   - **No new escape.** `[` and `]` are already escapable, so `\[\[` writes a
     literal doubled bracket.
   - `[[]]` yields no anchors, exactly as `[]` does.

### Emphasis [decided]

Markdown emphasis is overlaid by index like a chord — a `spans: Span[]` over the same
clean `text`, with the markers consumed.

- **Every pair of asterisks in a marker group is a bold marker; a lone leftover one is
  italic** [decided]. So one is italic, two bold, three both — and it does not stop
  there: `****A****` is bold twice over at each end, which leaves `A` plain and the
  asterisks consumed. Every flip in a group lands on the same character, so only their
  parity can survive; Phase 2 therefore flips bold when `⌊n/2⌋` is odd and italic when
  `n` is odd, and never needs to model the empty spans in between.
  - **The group, not the run, is the unit** — one run of `*` can hold two groups (it
    closes one emphasis and then the next one out) or a group and some printed text.
    Parity over a whole run would get `1+3` wrong, where parity over each group cannot.
  - **Why not "four or more is literal text"** (the earlier rule): it made the ladder
    stop for no reason a reader could see, and it was a second, competing answer to the
    question "is this asterisk markup?" — which is the matching rule's job, below. One
    rule decides that; this one only says what a marker _means_.

- **An asterisk is only markup if something matches it** [decided], and matching runs
  in **two passes, the second never overriding the first**:
  1. **Exact.** A closer that can spend exactly what the innermost opener holds does,
     and repeats for the next one out; a run that can close nothing opens with all of
     its asterisks. This pass is what makes nesting work — the `*` in `**a *b* c**`
     opens italic instead of eating one of the bold's asterisks.
  2. **Repair.** Whatever never matched pairs up anyway, as far as the shorter side
     goes. So `***** a as****` spends four against four and renders `* a as`, instead
     of dumping nine asterisks on the page because the author typed one too many.

  Only the asterisks still unspent after both passes are **printed**. So `*ab` prints
  its asterisk, `*asd**` is italic `asd` followed by a printed `*`, `**asd***` is bold
  `asd` followed by one, and `**a*b` is a printed `*` then italic `a` then `b`.
  - **A match spends an opener's rightmost asterisks and a closer's leftmost**, so what
    prints ends up outside the emphasis — never between a marker and the words it marks.
  - **Nothing is required on either side of a marker.** `* a *` is italic, spaces and
    all. Markdown's flanking rules would forbid it, and song text is full of asterisks
    hugging a space — the phrase has to stay emphasisable.
  - **Accepted cost:** two stray asterisks on one line therefore do pair, so
    `2* and 3*` italicises what is between them. `\*` is the answer there. It is the
    better half of the trade: strays are usually alone on a line, and the rule that
    catches the pair would lose `* a *`.
  - **Why not "an unclosed run emphasises to end of line"** (the earlier rule): one
    stray `*` — a footnote mark, `2*` — silently italicised the whole rest of the line
    while the author was still typing, and the only defence was escaping every asterisk
    in every lyric. A grammar for chord sheets cannot make the common character the
    dangerous one. `\*` stays available, and is now belt-and-braces rather than the
    price of writing `*`.
  - **Consequence: nothing is ever left open at end of line.** A match's two sides are
    the same length, so they flip the same bits and every bit is flipped an even number
    of times — the closing side closes its span, and Phase 2 needs no end-of-line fixup.

- **Deciding this needs the whole line**, not the text to the left of an asterisk, so it
  is one recogniser — `emphasisMarkers`, which answers _where each marker group starts
  and how long it is_ (groups rather than runs, since one run can be part markup and
  part text) — shared by Phase 2 and the editor's highlight grammar, the same reason
  `findClosingBracket` and `findLabelDelimiter` are shared. A stray asterisk must not
  colour as a marker in the editor and print as text in the preview.
- **Not inside `[…]`**, where asterisks are chord text, and not in title/subtitle/label
  text, which never reaches Phase 2.

### Chord validity & transpose [decided]

- The **only** reason to parse a chord is transpose, so the AST keeps **no parsed
  chord object** — just `valid: boolean` per anchor. Transpose is a **source-text**
  operation (it rewrites the original content string, per CONTEXT), owned by
  `TransposeService`, not a transform on this AST.
- **Validity + transpose use `@tonaljs/chord`** (pure logic, no DOM, tree-shakeable,
  offline-fine). `Chord.get(raw).empty === true` ⇒ invalid ⇒ `valid:false` ⇒
  verbatim annotation, never transposed (decision Q). Dependency policy: **minimal
  deps, justified case-by-case** (PRD §2) — chord theory is a solved, fiddly domain
  worth not hand-rolling.
- **Spelling on transpose:** no uniquely "correct" spelling exists without a key —
  it follows from the _interval_, not the semitone count (3 semitones up = minor
  third `C→E♭` or augmented second `C→D♯`, by key). With no declared key,
  **direction-based** (up→♯, down→♭) is a standard simple heuristic; **key-aware**
  is the truly correct refinement and is already future (CONTEXT). Even tonal needs
  the interval picked (`m2` vs `A1` are both one semitone), which direction supplies.
  Full detail belongs to the transpose grilling, not here.

### Notation — English source, a German/English print setting [partly decided]

- **Now (shipped):** the engine is English, plus the **German `H` as an extra name
  for B natural** — the common _mixed_ convention, where `B` stays B natural and
  `H` is the other name for it. `toEnglishNotation` (in `shared/domain`) rewrites a
  leading `H` and a `/bass` H to `B` before validity/transpose; both `ChordTheory`
  implementations call it, and the shared contract asserts it, so the real adapter
  and the fake cannot drift. The original `H` survives for display (it is the
  anchor's `raw`); only the parsed root normalises, so `[H]` transposes as the B it
  names and re-spells into **English** (`[H]`+1 ⇒ `[C]`).
- **Now (shipped, Epic 12): the `notation` setting (`german | english`, default
  `english`, `scopes: ['songbook','song']`) — the SPELLING half of it.** German
  prints B natural as `H` and B♭ as `B`; English prints B natural as `B` and B♭ as
  `Bb`, rewriting an `H` or an `Hb` that was typed into the source. **Both settings
  spell** — English shipped as the identity ("as typed"), which made the row
  `german | off`: a book pasted from two sources printed `H` beside `Bb`, and an
  `[Hb]` printed `Hb`, which is neither language. The English half is exactly
  `toEnglishNotation`, the same rewrite reading applies, so it needs no engine —
  only the validity gate, or the annotation `[Hold]` would print `[Bold]`.
  It is applied once, at the top of the render (`respellChords` in
  `shared/domain`, called by `RenderService.layout`), so screen, PNG, PDF and the
  songbook exports cannot disagree — and it never touches `content`. Choosing what
  a stored symbol _means_ from a preference would make the same file sound
  different on two devices, and a transpose would then bake the difference in; so
  reading stays one language and only printing follows the setting.
- **Still future — the parts that change what a symbol MEANS (deferred).** Each
  changes how an **existing** symbol reads or how transpose writes the source, so
  none of them can ride on the spelling switch above without a migration story:
  - **Strict German input:** `B` means **B♭** (and `H` means B natural). Today `B` is
    B natural for everyone; flipping it is exactly why this needs a setting.
  - **Solfège accidentals:** `Cis`/`Des`/`As`/`Es` (…) as note spellings.
  - **German transpose _output_:** re-spell B natural back to `H` and B♭ to `B` in
    the SOURCE, so a German-notation song reads as German in the editor after a
    transpose (today it comes back English there). The printed page already follows
    the setting, so this is about the text the author sees, not the render.
  - Interacts with the **key-aware spelling** refinement already parked above — both
    are "how is a transposed note spelled", one by key, one by notation.
  - _Domain-model:_ the `notation` row is already in the SETTINGS registry
    (`scopes: ['songbook','song']`), see `PRD-DOMAIN-MODEL.md`; these would change
    what it does, not add a row.

### No nesting [decided]

Chords and markdown never nest: no chord inside a chord, no `[` inside `[…]`, and
(future) no same-type markdown inside itself (bold-in-bold). Inside `[…]`, everything
up to the first unescaped `]` is chord content; inside `[[…]]`, everything up to the
first unescaped `]]`. The editor's insert buttons enforce this by disabling the action
when it would nest — the enforcement itself is a future upgrade (see Authoring notes).
The **Chord** button is the exception, and not a violation of the rule: inside a
bracket it rewrites that bracket instead of writing a second one.

### Escapes [decided]

- **Escape set (resolved):** `\` immediately followed by `:` `*` `[` `]` `\` `‹space›`
  → the backslash is **consumed** and the char is literal. `\\` → one literal `\`.
  `]` is escapable for symmetry with `[`, so a literal bracketed word reads `\[word\]`
  without stranding the trailing backslash. **Space** is escapable so a deliberate
  _leading_ space survives the Phase-1 indent strip (below); `\ ` mid-line just
  renders a space like any other char.
- **`\` before anything else is a literal backslash** (kept): `C:\path` keeps `\p`,
  `\n` is backslash-then-n, a trailing `\` at EOL is literal. No backslash-eating.
- **Resolved inside bracket tokens too, not only lyric text.** A repeat sign
  `[||\: … :||]` must escape its colon — an unescaped `[||:` is a colon-run
  followed by a space, so Phase 1 reads `[||` as a **label**. The escape is
  load-bearing, and its backslash is consumed when the token is rendered
  (`||\:` → `||:`), never left in the output.
- **Phase split:**
  - **Phase 1 is escape-_aware_ but does not consume.** An escaped `:` is not a
    label delimiter (`Narrator\:` → lyric); an escaped leading `*` is not a title.
    Classification only; the raw characters pass to Phase 2.
  - **Resolution happens in Phase 2, only on lyric/content text** — where `[`/`*`
    are actually special.
- **Title and label text are fully literal — no escape resolution.** Their only
  special char is positional (the `*` marker, the colon delimiter); they carry no
  inline markup, so a backslash inside them just renders (keeps Q3 consistent).
- **Cross-phase courtesy:** `\:` is resolved in Phase 2 even though `:` is not
  special there — the user typed it to defeat the _Phase-1_ label rule, so the stray
  backslash must not survive into the rendered lyric. `Narrator\: hi` → Phase 1
  "lyric" → Phase 2 renders `Narrator: hi`.

---

## Error / warning model [decided]

- **The parser is total — it never throws.** Any input (including half-typed text)
  yields a `Song` AST; problems surface as structured warnings. A parser feeding a
  live editor cannot throw.
- **`Warning { code: WarningCode; line: number; range?: [start, end]; data?: {…} }`**
  — code + source location + data, **never a baked string**. The UI localizes via
  `@angular/localize` (PRD §11). Adapts directly to editor diagnostics (Monaco
  `setModelMarkers`/`IMarkerData`, CodeMirror lint).
- **v1 codes:** `SHADOWED_TITLE`, `SHADOWED_SUBTITLE` (the "warning under all but the
  effective Title/Subtitle"). The enum stays open.
- **Deliberately not warnings:** invalid chords (`[N.C.]`, `[x2]` render verbatim by
  design — decision Q) and the label footgun (`Narrator: hi`; intent is unknowable,
  `\:` is the remedy, and false positives on `Chorus 2:` would be worse).

---

## Reparse [decided]

**Full reparse, debounced.** On editor change → debounce → `parse(getValue())` →
one fresh AST feeding **both** the render-preview signal and the editor markers. A
Song is "one page" (tens–low-hundreds of lines), so a full parse is sub-millisecond;
incremental dirty-tracking is premature optimization and would add stateful
complexity to a deliberately pure module.

- The **parse→render/markers debounce** (~50–150 ms, smooth preview) is **separate**
  from §5's keystroke-debounced autosave-to-IndexedDB — different cadence, different
  purpose ("show me" vs "don't lose my work").
- The editor's own highlighter (Monarch / CM) runs on its own schedule, independent
  of this parse.

---

## Authoring notes (deferred → editor PRD)

Editor insert buttons write markup at the cursor; they constrain the grammar (hence
noted) but are an editor concern:

- **Markdown (bold, italic) — each flips ONE bit of the asterisk run** [decided].
  Emphasis is a run whose _length_ is the state (1 italic, 2 bold, 3 both), not a
  pair of markers, so each button reads the run already around the selection or the
  word at the caret, flips its own bit, and rewrites the run to what the new pair of
  bits spells. Hence `*x*` + bold ⇒ `***x***`, and `***x***` + italic ⇒ `**x**`.
  Wrapping blindly instead would write a **fourth** asterisk — which this grammar reads
  as bold twice over, so the run emphasises nothing at all — and could not tell `**`
  from `*` well enough to keep Italic from un-bolding a bold run. Still **disabled
  inside a chord** (the asterisks would be chord text);
  that guard is a **future upgrade**.
- **Chord — three states in one button** [decided]. Not disabled inside a bracket,
  because in there it has something to say:
  1. **not in a bracket** → wrap the selection, else the word at the caret, else
     open an empty `[]` with the caret between the brackets;
  2. **in `[…]`** → double the brackets, making the chord inline;
  3. **in `[[…]]`** → take both brackets off, leaving the chord as plain text.

  Three presses come back to where they started. States 2 and 3 are a pure source
  rewrite in the domain (`cycleChordAt`); state 1 stays in the editor, which is the
  only side that knows what "the word at the caret" is.

- **A selection survives an insert, still selected** [decided]. What the user picked
  out is what they are working on; wrapping it moves it right by the opener and is
  not done with it. So the three chord states can be pressed straight through on one
  chosen word, and Bold then Italic on one selection gives `***both***` without
  re-selecting in between. A wrapped WORD (no selection) still leaves a caret — the
  user never made a selection, so the button does not invent one.

- **Label** — inserts the block's label marker and moves the cursor in front of it.
- **Title / Subtitle** — mark the current row (`*` / `**`), no rules.

### Editor integration — choice **[decided → CodeMirror 6, ADR-0010]**

The editor is **CodeMirror 6**, in the `songs` scope, behind a loose-coupling seam
(ADR-0010). Constraint that drove it: the product wants **syntax highlighting +
inline warning underlines**, so a plain `<textarea>` is insufficient — the editor
must be a highlighting code editor. Monaco was the other candidate; it lost once its
only edge (author familiarity) proved false, leaving CodeMirror 6 ahead on offline-
PWA bundle weight, Angular-21 integration (no worker plumbing), and touch-readiness.

The choice changes **nothing** decided in this spec: `ParserService` is a pure
`string → AST` function, **editor-agnostic**, and the editor consumes it through the
same four hooks either editor would expose — so the spec stayed editor-neutral and
the pick is swappable by design:

| Need               | Monaco                               | CodeMirror 6         |
| ------------------ | ------------------------------------ | -------------------- |
| highlight grammar  | Monarch (`setMonarchTokensProvider`) | stream/Lezer parser  |
| warning underlines | `setModelMarkers` / `IMarkerData`    | lint diagnostics     |
| reparse trigger    | `onDidChangeModelContent`            | update listener      |
| insert buttons     | `executeEdits` + cursor              | dispatch transaction |

Either way there are **two tokenizers**, both bound to this spec:

- the editor's **highlight grammar** — _colouring only_, line-oriented, **local**;
  it cannot do cross-document semantics (e.g. "shadowed title"). Our two-phase
  line-oriented grammar maps onto it directly.
- **`ParserService`** — the _semantic_ parser: render AST + warnings; cross-document
  diagnostics live here.

Why CodeMirror 6 won (recorded in ADR-0010): Monaco is heavy (MB-scale, workers) for
an offline PWA and documented-unsupported on touch; its only advantage was author
familiarity, which proved false. CodeMirror 6 is the lighter, worker-free, touch-
ready fit, and integrates into Angular 21 without worker plumbing. Highlighting uses
a CodeMirror **stream parser** (not a Lezer grammar) — the lightweight path the line-
oriented grammar maps onto directly.

---

## Rendering notes (deferred → rendering PRD)

Captured here so they aren't lost; they belong to the _rendering_ layer, not the
parser. The parser only preserves the information; the renderer acts on it.

- **`labelInline`** — a label with same-source-line content renders **together on
  one line** (label then content). A label whose content starts on the **next**
  source line renders on **two lines** (label, then content below). This is special,
  intentional behaviour, driven by the `labelInline` flag on the block.
- **`Line.label`** (sub-label) renders at the line's own start, in the flow, with the
  line's content following after it. It does **not** join the block's label gutter —
  a long instrument name would otherwise indent every line in the column.
- **Chords in the flow** — a chord renders **in** the line, taking horizontal space,
  when it is `inline` **or** when its line carries no lyric text (there is no
  character to float over, and a row of chords is the line). Flow chords are scaled
  back up to lyric size by a tuning multiplier; a chord above a lyric is not. This is
  a render property read off the AST, not a parse type, and it replaces the older
  "chord-only line distributed across the width" plus "all-chord-only block renders
  slightly larger" pair — same look, keyed on the chord instead of on the block it
  happened to sit in.
