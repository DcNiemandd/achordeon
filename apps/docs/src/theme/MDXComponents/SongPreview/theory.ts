import { TonalChordTheory } from '@achordeon/shared/chord-theory';

/**
 * The `ChordTheory` port, answered for real — one instance for the page, since it
 * is stateless.
 *
 * Both halves of a live example ask it the same question, and they must not
 * disagree: the grammar asks whether a bracket's contents are a chord (`[Am]`
 * brand-red, `[Solo]` a grey annotation), and the parser asks the same to set
 * each anchor's `valid`. A docs-only stub answering "nothing is a chord" would
 * have made the editor colour every bracket as an annotation — showing the reader
 * a rule the app does not have.
 */
export const theory = new TonalChordTheory();
