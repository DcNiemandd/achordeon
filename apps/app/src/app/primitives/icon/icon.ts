// Icon — Epic 13
// Spec: PRD-UI-SHELL.md §9 (self-hosted inline SVG; no CDN, ever)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { ICON_SET, type IconName } from './icon-set.generated';

/**
 * An inlined Lucide glyph.
 *
 * No icon font and no CDN: a `fonts.googleapis.com` request would break the
 * offline promise (`CONTEXT.md`) and add an origin the CSP must allow
 * (PRD-INFRASTRUCTURE.md §7). The rail is icon-only, so a cold offline boot
 * would otherwise show a column of empty boxes. Angular's own Aria examples
 * `@import` that URL — do not copy it.
 *
 * Decorative by default (`aria-hidden`): an icon sits inside a control that
 * already names itself via `aria-label`. Announcing it again would double-name
 * the control (PRD-UI-SHELL.md §5.2).
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [innerHTML]="markup()"
    ></svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      inline-size: var(--icon-size, 20px);
      block-size: var(--icon-size, 20px);
    }

    svg {
      inline-size: 100%;
      block-size: 100%;
      display: block;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * `bypassSecurityTrust*` is load-bearing here and safe *because of where the
   * string comes from*: `ICON_SET` is generated at build time from vendored
   * Lucide files and is a compile-time constant. No user input reaches this —
   * song content is never rendered through it (PRD-INFRASTRUCTURE.md §7).
   * `IconName` being a keyof the generated map is what keeps that true.
   */
  protected readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_SET[this.name()]),
  );
}
