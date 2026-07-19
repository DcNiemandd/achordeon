// Autofocus — Epic 5
// Spec: PRD-UI-SHELL.md §2

import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Moves focus to the host when it appears.
 *
 * **Not the `autofocus` attribute**, which is banned for good reason: it fires on
 * page load and drops a user somewhere they never asked to be. This is the other
 * case — an element that appears *because the user asked for it* (the rename
 * field opening on a row). Not moving focus there would mean the click that
 * opened it left the keyboard behind.
 *
 * `afterNextRender` rather than a constructor call: the element is not in the DOM
 * yet when a directive is constructed, and `focus()` on a detached node does
 * nothing at all — silently.
 */
@Directive({
  selector: '[appAutofocus]',
})
export class Autofocus {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      const element = host.nativeElement;
      element.focus();
      // A field that opens on existing text is there to replace it; selecting
      // saves the user a select-all they would have done anyway.
      if (element instanceof HTMLInputElement) {
        element.select();
      }
    });
  }
}
