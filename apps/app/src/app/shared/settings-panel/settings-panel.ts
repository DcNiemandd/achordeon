// Settings panel — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { SETTINGS } from '@achordeon/shared/domain';
import { Button, Icon, Tooltip } from '../../primitives';
import {
  GROUPS,
  GROUP_LABELS,
  SETTING_UI,
  keysForScope,
  type Group,
  type Option,
  type Scope,
  type SettingKey,
} from './setting-ui';

const CUSTOM = '__custom__';

interface Row {
  readonly key: SettingKey;
  readonly ui: (typeof SETTING_UI)[SettingKey];
  readonly value: unknown;
  /** True when this scope sets it; false when it is showing what it inherited. */
  readonly isOverridden: boolean;
  /** The value isn't in the preset list, so the free-text field is showing. */
  readonly isCustom: boolean;
}

interface Section {
  readonly group: Group;
  readonly label: string;
  readonly rows: Row[];
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
 * **Grouped, and it lays itself out.** Rows are sectioned by concern (page /
 * title / chords) rather than listed flat, and the grid is driven by a *container*
 * query, not the viewport — the same component is 300px wide inside the editor
 * dialog and 600px on the settings page, so it must answer "how much room do I
 * have", not "how big is the screen".
 */
@Component({
  selector: 'app-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Tooltip],
  template: `
    <div class="panel" data-testid="settings-panel">
      @for (section of sections(); track section.group) {
        <section class="section">
          <h3 class="section-title">{{ section.label }}</h3>

          <div class="grid">
            @for (row of section.rows; track row.key) {
              <div class="row" [attr.data-testid]="'setting-' + row.key">
                <div class="head">
                  <label class="label" [attr.for]="row.key">{{
                    row.ui.label
                  }}</label>

                  <!-- Click, not hover: touch has no hover and this panel is
                       edited on mobile, so hover-only help would not exist. -->
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

                  @if (scope() !== 'global') {
                    @if (row.isOverridden) {
                      <button
                        appButton
                        type="button"
                        class="reset"
                        [isIconOnly]="true"
                        [appTooltip]="resetLabel"
                        [attr.aria-label]="resetLabel"
                        [attr.data-testid]="'reset-' + row.key"
                        (click)="reset(row.key)"
                      >
                        <app-icon name="reset" />
                      </button>
                    } @else {
                      <span class="badge">{{ inheritedLabel }}</span>
                    }
                  }
                </div>

                @switch (row.ui.control.kind) {
                  @case ('choice') {
                    <div class="choices">
                      @for (opt of options(row); track opt.value) {
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

                  @case ('select') {
                    <select
                      class="control"
                      [id]="row.key"
                      [value]="row.isCustom ? CUSTOM : row.value"
                      [attr.data-testid]="'select-' + row.key"
                      (change)="onSelect(row, $event)"
                    >
                      @for (opt of options(row); track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                      <option [value]="CUSTOM">{{ customLabel }}</option>
                    </select>

                    @if (row.isCustom) {
                      <input
                        class="control"
                        type="text"
                        [value]="row.value"
                        [attr.aria-label]="row.ui.label"
                        [attr.data-testid]="'custom-' + row.key"
                        (change)="setFromInput(row.key, $event)"
                      />
                    }
                  }

                  @case ('color') {
                    <input
                      class="control is-color"
                      type="color"
                      [id]="row.key"
                      [value]="row.value"
                      (change)="setFromInput(row.key, $event)"
                    />
                  }

                  @default {
                    <div class="stepper">
                      <button
                        appButton
                        type="button"
                        variant="secondary"
                        [isIconOnly]="true"
                        [attr.aria-label]="decLabel(row)"
                        [attr.data-testid]="'dec-' + row.key"
                        [disabled]="!canStep(row, -1)"
                        (click)="step(row, -1)"
                      >
                        <app-icon name="minus" />
                      </button>
                      <output class="stepper-value" [attr.for]="row.key">{{
                        row.value
                      }}</output>
                      <button
                        appButton
                        type="button"
                        variant="secondary"
                        [isIconOnly]="true"
                        [attr.aria-label]="incLabel(row)"
                        [attr.data-testid]="'inc-' + row.key"
                        [disabled]="!canStep(row, 1)"
                        (click)="step(row, 1)"
                      >
                        <app-icon name="plus" />
                      </button>
                    </div>
                  }
                }
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
      /* The grid below asks THIS, not the viewport: the same component is 300px
         in the editor dialog and 600px on the settings page. */
      container-type: inline-size;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-3);
    }

    .section-title {
      margin: 0 0 var(--space-2);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    @container (min-width: 420px) {
      .grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-inline-size: 0;
    }

    .head {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .label {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .help,
    .reset {
      --icon-size: 13px;
      block-size: 18px;
      min-inline-size: 18px;
      color: var(--text-faint);
    }

    .reset {
      margin-inline-start: auto;
    }

    .badge {
      margin-inline-start: auto;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .control {
      inline-size: 100%;
      block-size: 28px;
      padding-inline: var(--space-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    .control.is-color {
      padding: 2px;
      cursor: pointer;
    }

    .choices {
      display: flex;
      gap: var(--space-1);
    }

    .choices > * {
      flex: 1;
    }

    /* Big arrows: a native number spinner is a ~10px target and unusable on
       touch. Sized to the content, not the column — arrows flung to opposite
       edges of a wide row read as two unrelated buttons, not one control. */
    .stepper {
      display: grid;
      grid-template-columns: 32px 3ch 32px;
      align-items: center;
      gap: var(--space-1);
      justify-content: start;
    }

    .stepper-value {
      text-align: center;
      font-size: var(--text-sm);
      /* Lining figures, so the value doesn't jitter as digits change. */
      font-variant-numeric: tabular-nums;
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

  protected readonly CUSTOM = CUSTOM;
  protected readonly inheritedLabel = $localize`:@@settings.inherited:Inherited`;
  protected readonly resetLabel = $localize`:@@settings.reset:Reset to inherited`;
  protected readonly customLabel = $localize`:@@settings.custom:Custom…`;

  /**
   * Rows where the user explicitly picked "Custom…".
   *
   * This cannot be derived from the value: picking Custom… seeds the field with
   * the value you already had, and that is usually a preset (`A4`), so a purely
   * derived `isCustom` would flip straight back to false and the field would
   * never appear. The *intent* to go custom is state; a value outside the preset
   * list is merely evidence of it. Ephemeral by design — it is which control is
   * showing, not what is saved.
   */
  private readonly customKeys = signal<ReadonlySet<SettingKey>>(new Set());

  private readonly rows = computed<Row[]>(() =>
    keysForScope(this.scope()).map((key) => {
      const own = this.values()[key];
      const isOverridden = own !== undefined;
      const value = isOverridden
        ? own
        : (this.inherited()[key] ?? SETTINGS[key].default);
      const ui = SETTING_UI[key];
      const isCustom =
        ui.control.kind === 'select' &&
        (this.customKeys().has(key) ||
          !ui.control.options.some((o) => o.value === String(value)));
      return { key, ui, value, isOverridden, isCustom };
    }),
  );

  protected readonly sections = computed<Section[]>(() =>
    GROUPS.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      rows: this.rows().filter((row) => row.ui.group === group),
    })).filter((section) => section.rows.length > 0),
  );

  protected helpLabel(row: Row): string {
    return $localize`:@@settings.about:About ${row.ui.label}:setting:`;
  }

  protected incLabel(row: Row): string {
    return $localize`:@@settings.increase:Increase ${row.ui.label}:setting:`;
  }

  protected decLabel(row: Row): string {
    return $localize`:@@settings.decrease:Decrease ${row.ui.label}:setting:`;
  }

  protected options(row: Row): readonly Option[] {
    const control = row.ui.control;
    return control.kind === 'select' || control.kind === 'choice'
      ? control.options
      : [];
  }

  protected canStep(row: Row, direction: number): boolean {
    if (row.ui.control.kind !== 'stepper') {
      return false;
    }
    const { min, max, step } = row.ui.control;
    const next = Number(row.value) + step * direction;
    return next >= min && next <= max;
  }

  protected step(row: Row, direction: number): void {
    if (row.ui.control.kind !== 'stepper') {
      return;
    }
    const { min, max, step } = row.ui.control;
    const next = Number(row.value) + step * direction;
    // Float steps (chordSize is 0.1) accumulate error: 1.1 + 0.1 = 1.2000000002.
    const rounded = Math.round(next * 100) / 100;
    this.set(row.key, Math.min(max, Math.max(min, rounded)));
  }

  protected onSelect(row: Row, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === CUSTOM) {
      // Remember the intent, and leave the value alone: the field seeds itself
      // with what you already had, so Custom… is somewhere to start editing
      // rather than a blank to puzzle over.
      this.customKeys.update((keys) => new Set(keys).add(row.key));
      return;
    }
    this.customKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(row.key);
      return next;
    });
    this.set(row.key, value);
  }

  protected set(key: SettingKey, value: unknown): void {
    this.changed.emit({ [key]: value });
  }

  protected setFromInput(key: SettingKey, event: Event): void {
    this.set(key, (event.target as HTMLInputElement).value);
  }

  protected reset(key: SettingKey): void {
    // Sparse storage (ADR-0006): resetting means REMOVING this scope's override
    // so the cascade resolves again, not writing the inherited value down.
    this.changed.emit({ [key]: undefined });
  }
}
