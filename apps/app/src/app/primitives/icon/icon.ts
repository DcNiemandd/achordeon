// Icon — Epic 13
// Spec: PRD-UI-SHELL.md §9 (self-hosted inline SVG; no CDN, ever)

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
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
  host: {
    'aria-hidden': 'true',
    '[class]': '{ relative: badge() !== undefined }',
  },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      [attr.fill]="isFilled() ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [innerHTML]="markupBase()"
    ></svg>
    @if (badge()) {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        [attr.fill]="isFilled() ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        focusable="false"
        [innerHTML]="markupBadge()"
        class="module-badge"
        [class.primary]="badgePrimary()"
      ></svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      inline-size: var(--icon-size, 20px);
      block-size: var(--icon-size, 20px);

      &.relative {
        position: relative;
      }
    }

    svg {
      inline-size: 100%;
      block-size: 100%;
      display: block;
    }

    /* Badged into the corner, not stacked: the hamburger stays the primary mark
       and the module reads as its state. Large enough to tell the five module
       glyphs apart at arm's length — at 13px they were all just "a small dark
       shape" and the badge carried no state at all. */
    .module-badge {
      inline-size: var(--badge-scale, 67%);
      block-size: var(--badge-scale, 67%);
      position: absolute;
      inset-block-end: var(--badge-inset-block-end, -2px);
      inset-inline-end: var(--badge-inset-inline-end, -2px);
      inset-inline-start: var(--badge-inset-inline-start, auto);
      inset-block-start: var(--badge-inset-block-start, auto);
      background: var(--badge-bg, var(--surface-raised));
      border-radius: 50%;
      padding: 1px;
      box-sizing: content-box;

      &.primary {
        color: var(--brand);
      }
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly badge = input<IconName>();

  /**
   * Paint the glyph solid instead of drawing it as an outline.
   *
   * Lucide is an outline set, so "on" and "off" otherwise differ only in colour —
   * and colour alone is not a state anyone should have to notice. A filled star
   * reads as favourited at a glance and, unlike a tinted one, still reads that way
   * to someone who cannot separate the two hues (PRD-UI-SHELL.md §5.2). Only
   * closed-path glyphs (star, heart) look right filled.
   */
  readonly isFilled = input(false, { transform: booleanAttribute });

  readonly badgePrimary = input(false, { transform: booleanAttribute });

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * `bypassSecurityTrust*` is load-bearing here and safe *because of where the
   * string comes from*: `ICON_SET` is generated at build time from vendored
   * Lucide files and is a compile-time constant. No user input reaches this —
   * song content is never rendered through it (PRD-INFRASTRUCTURE.md §7).
   * `IconName` being a keyof the generated map is what keeps that true.
   */
  protected readonly markupBase = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_SET[this.name()]),
  );
  protected readonly markupBadge = computed<SafeHtml | undefined>(() => {
    const badgeName = this.badge();
    return badgeName
      ? this.sanitizer.bypassSecurityTrustHtml(ICON_SET[badgeName])
      : undefined;
  });
}
