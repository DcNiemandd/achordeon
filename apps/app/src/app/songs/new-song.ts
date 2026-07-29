// What a new song is born as — Epic 5
// Spec: CONTEXT.md §Content syntax; docs/PARSER-GRAMMAR.md

/**
 * The starter content for a new song.
 *
 * **A skeleton, not a lesson.** A blank page would render nothing and give the
 * editor's chord and label buttons nothing to act on, so a new song opens with the
 * three things every song has — a title, a subtitle, and one named section — already
 * in place and already rendering next door. Typing over them is the whole
 * interaction.
 *
 * **One construct, not the whole grammar.** The single line teaches where a chord
 * lands, which is the one rule nothing else in the UI can show. The rest of the
 * language is the guide song's job (`guide-song-content.ts`), and a first-time user
 * has that song sitting in their library — teaching it again here would mean
 * maintaining the same lesson twice in every locale, and would hand somebody making
 * their fortieth song a wall of text to select and delete.
 *
 * Kept out of the presenter because it is **copy, not logic**, and it is the kind
 * of copy that gets rewritten by whoever is best at explaining things — which is
 * not necessarily whoever is editing `create()`.
 *
 * **Translatable, with a caution baked into the `$localize` description**, emitted
 * as an XLF `<note>` so a translator knows to keep the syntax and translate only the
 * words. It carries no literal `:` / `\` / `|` / `@` — any of those would terminate
 * or corrupt the `$localize` metadata block.
 *
 * The rendered title here and the library label (`@@songs.newName`) are two messages
 * that say the same thing for two different jobs. Nothing enforces that they agree —
 * `check-locales.mjs` compares key sets, not wording — so a locale changing one
 * should change the other.
 */
export const NEW_SONG_CONTENT = $localize`:|Starter content for a new song, in place of a blank page. It is source text in the song syntax rather than prose, so translate only the ordinary words. Do not translate or move the chords (each is a name such as C or G inside square brackets). Keep the leading star and double-star title markers, and keep the label followed by a colon character so the section still has a name. The title should read the same as the message for the new-song library label.@@songs.newContent:* New song
** Subtitle

Verse: A chord in [C]brackets lands over the [G]letter after it.
`;
