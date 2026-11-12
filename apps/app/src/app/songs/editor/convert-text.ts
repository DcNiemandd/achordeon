import { convertChordSheet, type ChordTheory } from '@achordeon/shared/domain';

/**
 * A piece of the editor's text converted as a Chord sheet, ending the way it
 * ended — what the Convert bar and the Convert button put in its place.
 *
 * Always written in English chords. The sheet's Dialect is read off its own
 * spelling (an `H` or a `mi` says German); the song's notation setting is never
 * consulted, because it only spells the rendered page.
 *
 * Asked for, so always converted: text the detector would not call a sheet (one
 * chord row) is read as chord rows (Q36), while ChordPro is still read as ChordPro.
 */
export function convertText(text: string, theory: ChordTheory): string {
  let result = convertChordSheet(text, theory);
  if (result.kind !== 'converted') {
    result = convertChordSheet(text, theory, { format: 'chord-rows' });
  }
  const content = result.kind === 'converted' ? result.content : text;
  return text.endsWith('\n') ? content : content.replace(/\n$/, '');
}
