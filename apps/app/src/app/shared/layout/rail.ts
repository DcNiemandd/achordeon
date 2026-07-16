// Rail — Epic 13
// Spec: PRD-UI-SHELL.md §4 (desktop)

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon, Tooltip } from '../../primitives';
import { NAV_ITEMS, NAV_SETTINGS } from './nav-items';

/**
 * The full-height icon rail: the four nav modules, with Settings pinned to the
 * bottom in its own group.
 *
 * A `<nav>` of `<a routerLink>`, **not** an Aria toolbar. Two reasons: the
 * router is already the source of truth for "which module", so a toolbar's own
 * selection model would fight it; and the WAI-ARIA APG is explicit that
 * `role="menu"`/toolbar semantics are for application commands, not site
 * navigation. Links in a nav landmark are what a screen reader wants here.
 *
 * This is **not** the VSCode side bar — there is no collapsible explorer panel.
 * The explorer content *is* pane A in the modules that need it (§4).
 */
@Component({
  selector: 'app-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon, Tooltip],
  template: `
    <nav
      class="rail"
      data-testid="rail"
      [attr.aria-label]="navLabel"
      i18n-aria-label="@@rail.label"
    >
      <ul class="group">
        @for (item of items; track item.id) {
          <li>
            <a
              class="item"
              [routerLink]="item.route"
              routerLinkActive="is-active"
              [attr.data-testid]="'rail-' + item.id"
              [attr.aria-label]="item.label"
              [appTooltip]="item.label"
            >
              <app-icon [name]="item.icon" />
            </a>
          </li>
        }
      </ul>

      <ul class="group group-end">
        <li>
          <a
            class="item"
            [routerLink]="settings.route"
            routerLinkActive="is-active"
            [attr.data-testid]="'rail-' + settings.id"
            [attr.aria-label]="settings.label"
            [appTooltip]="settings.label"
          >
            <app-icon [name]="settings.icon" />
          </a>
        </li>
      </ul>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .rail {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      inline-size: var(--rail-width);
      block-size: 100%;
      background: var(--surface-raised);
      border-inline-end: 1px solid var(--border);
    }

    .group {
      list-style: none;
      margin: 0;
      padding: var(--space-1) 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .group-end {
      border-block-start: 1px solid var(--border);
    }

    .item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      block-size: var(--rail-width);
      color: var(--text-muted);
      text-decoration: none;
      transition: color var(--duration-fast) var(--ease);
    }

    .item:hover {
      color: var(--text);
    }

    /* The active marker. On mobile this job falls to the module switcher's
       composite glyph, which is why that glyph wears the module icon (§4). */
    .item.is-active {
      color: var(--brand);
    }

    .item.is-active::before {
      content: '';
      position: absolute;
      inset-block: 6px;
      inset-inline-start: 0;
      inline-size: 2px;
      background: var(--brand);
      border-start-end-radius: var(--radius-sm);
      border-end-end-radius: var(--radius-sm);
    }
  `,
})
export class Rail {
  protected readonly items = NAV_ITEMS;
  protected readonly settings = NAV_SETTINGS;
  protected readonly navLabel = $localize`:@@rail.label:Main`;
}
