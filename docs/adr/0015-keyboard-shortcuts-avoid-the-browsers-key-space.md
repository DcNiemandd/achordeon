# 15. Keyboard shortcuts avoid the browser's key space

Date: 2026-08-09

## Status

Accepted

## Context

Achordeon is meant to be editable without a pointer: create a Song, move through
the library, open the editor, write and mark up the content, leave again. Until
now the app had exactly one shortcut — Escape leaves the editor — plus whatever
CodeMirror brings and a handful of keys Stage handles for itself
(`stage-perform.page.ts`). `apps/docs/docs/songs/editing.mdx` already promised
`alt + c` for inserting a chord, and nothing implemented it: the first thing this
work has to fix is a documented shortcut that does not exist.

The obvious map is the one every desktop app uses: `Ctrl` for application
actions, digits for switching between the app's sections. It cannot be built.

**The browser owns the keys that map would need.** Chrome and Firefox reserve
`Ctrl+N`, `Ctrl+T`, `Ctrl+W` and `Ctrl+1…9`; the page never receives them and
cannot cancel them. Achordeon has five destinations (four `NAV_ITEMS` plus
Settings) — exactly the digits — and its most frequent action, new Song, is
exactly `Ctrl+N`. Installed as a PWA those presses do reach the page, which is
worse than losing them: the shortcut would work for whoever built it and do
nothing, silently, for anyone running the app in a tab.

**`Ctrl+Alt` is not the way out.** On a Czech layout that combination is AltGr,
which is how `[`, `]` and `@` are typed — the very characters a Song's content is
made of.

**Neither is matching on the character produced.** On macOS `Alt+C` produces `ç`,
so a map matched against `KeyboardEvent.key` misses the whole modifier tier on
that platform.

### Options

- **A — `Ctrl` map anyway, working only in the installed PWA.** Familiar and
  conventional, and the hint dialog would have to carry an asterisk explaining
  why a listed key does nothing on the web. The users it fails are the ones who
  have not installed yet — precisely the ones learning the app.

- **B — one modifier for everything (`Alt`+letter, `Alt`+digit).** A single rule
  to teach, free of Chrome's reservations. But Firefox on Linux takes `Alt`+digit
  for tabs, and a digit says nothing about where it goes: Stage is 3 for no
  reason a user can reconstruct.

- **C — take nothing the browser or the layout can claim.** Navigation becomes a
  leader chord — `g`, released, then a letter naming the destination — and
  content actions stay on `Alt`+letter, which no browser and no CodeMirror
  default keymap reserves. `Ctrl` is left entirely to the browser.

## Decision

Adopt **Option C**. Achordeon's shortcuts live in two tiers, split by whether a
key can be pressed while writing.

- **Bare tier — navigation.** `g` then `s` / `b` / `t` / `a` / `,` for Songs,
  Songbooks, Stage, Audience and Settings; bare letters for a list's own actions
  where focus is a list rather than a text field. No modifier is held, so no
  browser and no keyboard layout can take them, and they behave identically in a
  tab and in the installed app.
- **Modifier tier — the content under the caret.** `Alt`+letter for inserting
  markup, transposing and the accidentals. These stay live while writing, because
  that is the only place they mean anything.
- **`Ctrl` is unused.** Not as an oversight — as the point. Every `Ctrl`
  combination worth having is either reserved by the browser or claimed by the
  editor's own history keys.
- **Bare-tier keys are dead wherever text is being typed**, including inside the
  Song's content, or typing the letters of a lyric would navigate away. The
  modifier tier is guarded only against `input`/`textarea` — the established rule
  at `song-editor.page.ts`, which deliberately does not treat the editor body as
  a text field.
- **Presses match physical key positions** (`KeyboardEvent.code`), so `Alt`+the
  C key fires on macOS and on every layout. The hint dialog asks the browser what
  that key is actually engraved with (`navigator.keyboard.getLayoutMap()`) and
  falls back to the English letter where that is unavailable. Nothing is bound to
  Y or Z, which are the two keys a Czech QWERTZ swaps.
- **Shortcuts and buttons come from one action declaration.** An action carries
  its label, its enablement and what it does, once; the toolbar renders from it,
  the keymap binds to it, the `?` dialog lists it. A key can therefore never
  disagree with a greyed-out button, and the future custom-shortcut settings UI
  (`DOC-REVISION-PLAN.md`) rebinds keys without touching actions.
- **Registrations are a stack of layers.** The topmost layer holding a key runs
  it, and a dialog shadows the screen beneath it. Escape stops being special:
  the settings dialog's Escape wins over the editor's because it is on top, which
  replaces the hand-written guards in `song-editor.page.ts` and
  `stage-perform.page.ts`.
- **`?` opens the list, `Alt+/` is its in-text alias** — one action with two
  keys, because the screen with the most shortcuts is the one where a bare `?` is
  a character you are typing.

## Consequences

- Muscle memory from other apps does not transfer. `Ctrl+N` will be pressed and
  will open a browser window; that is the browser's answer, not ours to change.
- A leader chord needs an armed state with a timeout, and a visible one — an
  invisible mode that eats the next keystroke is worse than no shortcut.
- Documentation stops enumerating. `editing.mdx` teaches the two tiers and points
  at `?`; the dialog is the authoritative map, so the `alt + c` class of lie
  cannot recur in a page nobody regenerates.
- Existing keys move house. Stage's arrows, zoom and Escape, and the editor's
  Escape, become registrations like everything else, so the dialog can list them
  — a behaviour-preserving change to a screen this work is otherwise not about.
- The shortcut set is only as good as the action declarations, so any new toolbar
  button is a new action or it is invisible to both the keymap and the dialog.
- Should the app ever ship only as an installed PWA, the reservation argument
  weakens and a `Ctrl` map becomes possible — the reason to revisit this record.
