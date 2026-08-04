// Turn the page — the label
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md; CONTEXT.md §Turn the page

/**
 * What the toggle says — one string, in every state.
 *
 * **A mode, not an act**, which is the whole reason it stopped being a pair.
 * This control does not turn the page; it says the reader is willing to hold the
 * device the other way round, and the app then turns the pages that gain by it
 * and leaves the rest upright (ADR-0013). A label reading "Turn the page
 * sideways" promised something immediate and unconditional, and a portrait song
 * two slots later made a liar of it. So it behaves like the dark page beside it:
 * the text stays put and the row lights up.
 *
 * Shared by three bars — the phone's overflow menu, the Audience's, and Stage's
 * wide unwrapped row — because a label written out three times eventually reads
 * three ways, or ships with one of the `@@` ids left untranslated.
 */
export const turnPageLabel = $localize`:@@stage.turnPage:Automatic rotation`;
