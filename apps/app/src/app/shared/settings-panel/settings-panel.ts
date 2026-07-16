// Settings panel — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { SETTINGS } from '@achordeon/shared/domain';
import { Button, Icon, Tooltip } from '../../primitives';
import {
  SETTING_UI,
  keysForScope,
  type Scope,
  type SettingKey,
} from './setting-ui';

interface Row {
  readonly key: SettingKey;
  readonly ui: (typeof SETTING_UI)[SettingKey];
  readonly value: unknown;
  /** True when this scope sets it; false when it is showing what it inherited. */
  readonly isOverridden: boolean;
}

/**
 * The render settings form — **one component, three homes**: the Settings page
 * (Global scope), Songbook detail (Songbook scope), and the song editor (Song
 * scope). The container differs per home; the panel does not. Epic 12 mounts this
 * same component — it is built once.
 *
 * It is a **controlled form and nothing more**: values in, a sparse patch out. It
 * holds no state and injects no store, like every other component (§3) — each
 * feature's thin wrapper binds it to that feature's presenter.
 *
 * Vertical and scrollable rather than a toolbar row, because the registry grows
 * (`font` is already queued), several controls are not toolbar-shaped (a colour
 * picker, an aspect input with presets), and every row needs an
 * inherited/overridden badge with a reset (ADR-0006).
 */
@Component({
  selector: 'app-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Tooltip],
  template: `
    <div class="panel" data-testid="settings-panel">
      @for (row of rows(); track row.key) {
        <div class="row" [attr.data-testid]="'setting-' + row.key">
          <div class="head">
            <label class="label" [attr.for]="row.key">{{ row.ui.label }}</label>

            <!-- Click, not hover: touch has no hover and this panel is edited on
                 mobile, so a hover-only help affordance would not exist there. -->
            <button
              appButton
              type="button"
              class="help"
              [isIconOnly]="true"
              [appTooltip]="row.ui.help"
              appTooltipTrigger="click"
              [attr.aria-label]="helpLabel(row)"
              [attr.data-testid]="'help-' + row.key"
            >
              <app-icon name="help" />
            </button>

            @if (row.isOverridden && scope() !== 'global') {
              <span
                class="badge"
                [attr.data-testid]="'overridden-' + row.key"
                >{{ overriddenLabel }}</span
              >
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [appTooltip]="resetLabel"
                [attr.aria-label]="resetLabel"
                [attr.data-testid]="'reset-' + row.key"
                (click)="reset(row.key)"
              >
                <app-icon name="reset" />
              </button>
            } @else if (scope() !== 'global') {
              <span class="badge is-inherited">{{ inheritedLabel }}</span>
            }
          </div>

          @switch (row.ui.control.kind) {
            @case ('choice') {
              <div class="choices">
                @for (opt of choiceOptions(row); track opt.value) {
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    [class.is-active]="row.value === opt.value"
                    [attr.aria-pressed]="row.value === opt.value"
                    [attr.data-testid]="row.key + '-' + opt.value"
                    (click)="set(row.key, opt.value)"
                  >
                    {{ opt.label }}
                  </button>
                }
              </div>
            }
            @case ('color') {
              <input
                class="control"
                type="color"
                [id]="row.key"
                [value]="row.value"
                (change)="setFromInput(row.key, $event)"
              />
            }
            @case ('text') {
              <input
                class="control"
                type="text"
                [id]="row.key"
                [value]="row.value"
                [attr.list]="row.key + '-presets'"
                (change)="setFromInput(row.key, $event)"
              />
              <datalist [id]="row.key + '-presets'">
                @for (preset of textPresets(row); track preset) {
                  <option [value]="preset"></option>
                }
              </datalist>
            }
            @default {
              <input
                class="control"
                type="number"
                [id]="row.key"
                [value]="row.value"
                [min]="numberControl(row).min ?? null"
                [max]="numberControl(row).max ?? null"
                [step]="numberControl(row).step ?? null"
                (change)="setNumber(row.key, $event)"
              />
            }
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-3);
    }

    .row {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .label {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .help {
      --icon-size: 14px;
      block-size: 20px;
      color: var(--text-faint);
    }

    .badge {
      margin-inline-start: auto;
      font-size: var(--text-xs);
      color: var(--brand);
      background: var(--brand-subtle);
      padding: 2px var(--space-1);
      border-radius: var(--radius-sm);
    }

    .badge.is-inherited {
      color: var(--text-faint);
      background: none;
    }

    .control {
      inline-size: 100%;
      block-size: 32px;
      padding-inline: var(--space-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    input[type='color'] {
      padding: 2px;
      cursor: pointer;
    }

    .choices {
      display: flex;
      gap: var(--space-1);
      flex-wrap: wrap;
    }
  `,
})
export class SettingsPanel {
  /** Which cascade level is being edited — decides which rows are drawable. */
  readonly scope = input.required<Scope>();
  /** The sparse overrides set at THIS scope. */
  readonly values = input<Record<string, unknown>>({});
  /** Resolved values from below, for the inherited badge and reset target. */
  readonly inherited = input<Record<string, unknown>>({});

  /** One sparse patch out. `undefined` for a key means "reset to inherited". */
  readonly changed = output<Record<string, unknown>>();

  protected readonly overriddenLabel = $localize`:@@settings.overridden:Overridden`;
  protected readonly inheritedLabel = $localize`:@@settings.inherited:Inherited`;
  protected readonly resetLabel = $localize`:@@settings.reset:Reset to inherited`;

  protected readonly rows = computed<Row[]>(() =>
    keysForScope(this.scope()).map((key) => {
      const own = this.values()[key];
      const isOverridden = own !== undefined;
      return {
        key,
        ui: SETTING_UI[key],
        // Show the effective value: this scope's override if it set one, else
        // what it inherits, else the registry default.
        value: isOverridden
          ? own
          : (this.inherited()[key] ?? SETTINGS[key].default),
        isOverridden,
      };
    }),
  );

  protected helpLabel(row: Row): string {
    return $localize`:@@settings.about:About ${row.ui.label}:setting:`;
  }

  protected choiceOptions(row: Row) {
    return row.ui.control.kind === 'choice' ? row.ui.control.options : [];
  }

  protected textPresets(row: Row): readonly string[] {
    return row.ui.control.kind === 'text' ? row.ui.control.presets : [];
  }

  protected numberControl(row: Row): {
    min?: number;
    max?: number;
    step?: number;
  } {
    return row.ui.control.kind === 'number' ? row.ui.control : {};
  }

  protected set(key: SettingKey, value: unknown): void {
    this.changed.emit({ [key]: value });
  }

  protected setFromInput(key: SettingKey, event: Event): void {
    this.set(key, (event.target as HTMLInputElement).value);
  }

  protected setNumber(key: SettingKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.set(key, raw === '' ? undefined : Number(raw));
  }

  protected reset(key: SettingKey): void {
    // Sparse storage (ADR-0006): resetting means REMOVING this scope's override
    // so the cascade resolves again, not writing the inherited value down.
    this.changed.emit({ [key]: undefined });
  }
}
