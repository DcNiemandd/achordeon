// Field — Epic 5
// Spec: PRD-UI-SHELL.md §2 (what Aria does not ship, we build)

import { Directive } from '@angular/core';

/**
 * `<input appField>` — the plain text input Aria deliberately does not ship.
 *
 * A **directive on a real element**, for the same reason `appButton` is one: the
 * host keeps native semantics, form participation, autofill, IME composition and
 * focus for free. All this adds is the skin.
 *
 * That skin lives in `styles/_controls.scss` beside the button's, because a
 * directive has no view to encapsulate — and it is nothing but design tokens,
 * which is exactly what a redesign replaces wholesale (§6).
 */
@Directive({
  selector: 'input[appField]',
  host: { class: 'app-field' },
})
export class Field {}
