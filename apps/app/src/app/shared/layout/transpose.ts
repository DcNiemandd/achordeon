// Performance transpose — the shape of the offset, shared by both sessions.
// Spec: apps/docs/docs/stage-audience/index.mdx §Transpose
//
// A performer and a viewer each hold their own offset (a capo on one guitar is
// not a capo on the other), but they hold it to the same rules — so the range,
// the wrap and the way it is written down live here rather than twice.

/**
 * How far the offset may travel before it wraps: ±11 semitones.
 *
 * Twelve is the octave, which is the same pitch on the page and so the same
 * render — a "+12" that looked like a setting but changed nothing would be a lie
 * the control tells about itself. So the twelfth step lands on 0 instead
 * ({@link stepTranspose}), which is where it would have sounded anyway.
 */
export const TRANSPOSE_LIMIT = 11;

/** One step up (`+1`) or down (`-1`), wrapping through the octave back to 0. */
export function stepTranspose(current: number, direction: number): number {
  const next = current + direction;
  return Math.abs(next) > TRANSPOSE_LIMIT ? 0 : next;
}

/**
 * The offset as it is read: `+2`, `-3`, `0`. Signed always, because the sign is
 * the half of it that says which way — an unsigned `2` is a count of nothing.
 */
export function formatSemitones(offset: number): string {
  return offset > 0 ? `+${offset}` : String(offset);
}

/**
 * What the menu row calls itself — the act, and where it already stands.
 *
 * The audience button's trick (`StageSession.audienceLabel`), for the same
 * reason: on a phone the control is a row of text behind ⋯, so the row has to
 * say what the desktop stepper shows in the open. Both bars draw it, so the
 * ternary lives once.
 */
export function transposeActionLabel(offset: number): string {
  const amount = formatSemitones(offset);
  return offset === 0
    ? $localize`:@@transpose.action:Transpose`
    : $localize`:@@transpose.actionAt:Transpose (${amount}:offset:)`;
}
