// Button — Epic 13
// Spec: PRD-UI-SHELL.md §2 (what Aria does not ship, we build)

import { Directive, input } from '@angular/core';

/**
 * `<button appButton>` — the plain control Aria deliberately does not ship.
 *
 * A **directive on a real `<button>`**, not a wrapper component: the host keeps
 * native semantics, `type`, `disabled`, form participation and focus for free.
 * All this adds is typed inputs mapped onto host classes.
 *
 * The skin lives in `styles/_controls.scss` rather than in component styles,
 * because a directive has no view to encapsulate. That is a fair trade here —
 * the skin is nothing but design tokens, which is exactly what a redesign
 * replaces wholesale (§6).
 */
@Directive({
  selector: 'button[appButton]',
  host: {
    class: 'app-button',
    '[class]': '"variant-" + variant() + " size-" + size()',
    '[class.is-icon-only]': 'isIconOnly()',
  },
})
export class Button {
  readonly variant = input<'primary' | 'secondary' | 'ghost'>('ghost');
  readonly size = input<'md' | 'lg'>('md');
  /** Square target; the accessible name comes from `aria-label` (§5.2). */
  readonly isIconOnly = input(false);
}
