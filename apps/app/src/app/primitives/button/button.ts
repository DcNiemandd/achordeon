// Button — Epic 13
// Spec: PRD-UI-SHELL.md §2 (what Aria does not ship, we build)

import { Directive, input } from '@angular/core';

/**
 * `<button appButton>` / `<a appButton>` — the plain control Aria deliberately
 * does not ship.
 *
 * A **directive on a real element**, not a wrapper component: the host keeps
 * native semantics, `type`, `disabled`, form participation and focus for free.
 * All this adds is typed inputs mapped onto host classes.
 *
 * Anchors are supported because a control that *navigates* must be a link — it
 * has to middle-click, open in a new tab, and announce as a link. Something that
 * looks like a button but is one only visually is the point of the `a` selector,
 * not an oversight.
 *
 * The skin lives in `styles/_controls.scss` rather than in component styles,
 * because a directive has no view to encapsulate. That is a fair trade here —
 * the skin is nothing but design tokens, which is exactly what a redesign
 * replaces wholesale (§6).
 */
@Directive({
  selector: 'button[appButton], a[appButton]',
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
