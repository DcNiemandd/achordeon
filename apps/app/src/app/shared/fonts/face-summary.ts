// How many faces a family has, in one line — Spec: PRD-RENDERING §4.10
//
// Shared by the library list and the add dialog's search **so that they say the
// same thing in the same words**. A search result is a promise about what
// installing will produce, and the row it becomes is the record of what it
// did — if those two sentences differed, the one that came first would read as
// having been wrong.

import type { FontFamily } from '@achordeon/shared/render-core';

/** Out of four: regular, bold, italic and bold italic (`BODY_FACES`). */
export function faceSummary(count: number, isVariable: boolean): string {
  if (isVariable) {
    return $localize`:@@fonts.facesVariable:${count}:count: of 4 styles — this font comes as one variable file, and only its default style can be printed`;
  }
  return $localize`:@@fonts.faces:${count}:count: of 4 styles`;
}

/** The same line for a family that is already installed. */
export function familyFaceSummary(family: FontFamily): string {
  return faceSummary(
    Object.keys(family.faces).length,
    family.isVariable === true,
  );
}
