// Turn the page — the label
// Spec: docs/adr/0013-rotation-is-derived-not-authored.md; CONTEXT.md §Turn the page

/**
 * What the toggle says, given whether the reader has already turned the page.
 *
 * Beside `transposeActionLabel` and for its reason: the row lives in two bars
 * (Stage's and the Audience's), and a label written out twice is a label that
 * eventually reads two different ways in two places — or worse, ships with one
 * of the two `@@` ids left untranslated.
 *
 * It names the **act**, not the state: pressed, this control's job is to offer
 * the way back, which is what the flipped arrow in its icon is saying too.
 */
export function turnPageActionLabel(isArmed: boolean): string {
  return isArmed
    ? $localize`:@@stage.turnPage.back:Turn back upright`
    : $localize`:@@stage.turnPage:Turn the page sideways`;
}
