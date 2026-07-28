// What a new song is born as — Epic 5
// Spec: CONTEXT.md §Content syntax; docs/PARSER-GRAMMAR.md

/**
 * The starter content for a new song.
 *
 * **A blank page teaches nothing.** Achordeon's content is a small plain-text
 * language, and every rule in it is invisible until you have seen it work: that a
 * chord goes in brackets where the sound changes, that a blank line starts a
 * block, that the words before a colon become a label. A new song that opens
 * empty asks the user to go and find that out somewhere else.
 *
 * So a new song opens as a **worked example that is also a real song** — it
 * renders correctly in the pane next door, so every line is visibly doing what it
 * claims. It is meant to be deleted: the user selects all and types over it, and
 * by then they have read it.
 *
 * **It covers the whole language**, one construct per line, in the order someone
 * meets them: title, subtitle, label, chord, several chords in one bracket,
 * sub-label, emphasis, escapes, a row of chords, a chord inside a line of words,
 * and a bracket that is not a chord. Anything the grammar can do and this does not
 * show is a gap — the file is the language's shop window, so a new construct lands
 * here in the same change that adds it.
 *
 * Kept out of the presenter because it is **copy, not logic**, and it is the kind
 * of copy that gets rewritten by whoever is best at explaining things — which is
 * not necessarily whoever is editing `create()`.
 *
 * **Translatable, with a caution baked into the `$localize` description.** This is
 * one message (`@@songs.tutorial`), so a locale rewrites it wholesale — a good
 * Czech version is a Czech tutorial *song*, not a word-for-word translation. The
 * description below is emitted as an XLF `<note>` so a translator (or a machine)
 * knows to keep the syntax and translate only the words. It carries no literal
 * `:` / `\` / `|` / `@` — any of those would terminate or corrupt the `$localize`
 * metadata block, which is why the escapes are described rather than shown.
 */
export const TUTORIAL_CONTENT = $localize`:|Starter content for a new song. It teaches the song syntax by example, so it is source text, not prose — translate only the ordinary words and keep everything else exactly as written. Do not translate or move the chords (each is a name such as C, G or Am inside square brackets, single or doubled). Keep the leading star and double-star title markers, every label that ends in a colon character (including the one ending in two, and the short ones naming a single row), the backslash escapes, the star markers around emphasised words, and the blank lines that separate blocks.@@songs.tutorial:* My first song
** A quick tour of the syntax

Verse: Put a chord in [C]brackets, right where the [G]sound changes.
It lands above the [Am]letter that follows it.
Several in one bracket [C G Am]sit in the same place.

R:: A label ending in two colons keeps one, so this block is called R and a colon.
Only a blank line starts a new [F]block.
Emphasis is **bold**, *italic*, or ***both***.
Write \\: for a colon that is not a label, \\* for a star, \\[ for a bracket.
\\ A backslash and a space keep a space at the start of a line.

Intro:
Guitar: [Am F G Am (2x)]
Fiddle: [Am F G Am (4x)]

[C] [G] [Am] [F]

Outro: A row with no words sets its chords in the line, at the size of the words.
Doubled brackets do the same [[C]] inside a line that has some.
A label further down a block names only its own row, so
Softly: this one is in italics.
A bracket that is not a chord floats above the line[Solo] just as written[N.C.].
`;
