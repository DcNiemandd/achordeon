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
 * Kept out of the presenter because it is **copy, not logic**, and it is the kind
 * of copy that gets rewritten by whoever is best at explaining things — which is
 * not necessarily whoever is editing `create()`.
 */
export const TUTORIAL_CONTENT = $localize`:@@songs.tutorial:* My first song
** A quick tour of the syntax

Verse: Put a chord in [C]brackets, right where the [G]sound changes.
It lands above the [Am]letter that follows it.

Chorus: The words before a colon become a [F]label.
A blank line starts a new [C]block.
Write \\: when you want a colon that is not a label.

[C] [G] [Am] [F]

Outro: A line of nothing but chords is an instrumental,
and it renders a little larger.
`;
