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

interface Row {
  readonly key: SettingKey;
  readonly ui: (typeof SETTING_UI)[SettingKey];
  readonly value: unknown;
  /** True when this scope sets it; false when it is showing what it inherited. */
  readonly isOverridden: boolean;
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

                  @if (scope() === 'global') {
                    <!-- Global is the base of the cascade, so it inherits from
                         nothing — "reset" here means back to the REGISTRY
                         default, not to an inherited value. Shown only once the
                         value has moved off its default, like the override reset
                         below: there is nothing to reset a default to. -->
                    @if (!isAtDefault(row)) {
                      <button
                        appButton
                        type="button"
                        class="reset"
                        [isIconOnly]="true"
                        [appTooltip]="resetDefaultLabel"
                        [attr.aria-label]="resetDefaultLabel"
                        [attr.data-testid]="'reset-' + row.key"
                        (click)="resetToDefault(row.key)"
                      >
                        <app-icon name="reset" />
                      </button>
                    }
                  } @else {
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
                    @if (!allowsCustom(row)) {
                      <!-- A closed list: every valid answer is in it, so there is
                           nothing to type. A free-text box here would invite a
                           value the renderer has no idea what to do with. -->
                      <select
                        class="control"
                        [id]="row.key"
                        [value]="row.value"
                        [attr.data-testid]="'select-' + row.key"
                        (change)="setFromInput(row.key, $event)"
                      >
                        @for (opt of options(row); track opt.value) {
                          <option [value]="opt.value">{{ opt.label }}</option>
                        }
                      </select>
                    } @else {
                      <!-- One control, not two: the field always shows the value
                         and always takes a typed one; the chevron is a shortcut
                         to the named answers. There is no "custom mode" to be
                         in, so there is no way to be stuck in it. -->
                      <div class="input-group">
                        <input
                          class="group-field"
                          type="text"
                          [id]="row.key"
                          [value]="row.value"
                          [attr.data-testid]="'input-' + row.key"
                          (change)="setFromInput(row.key, $event)"
                        />
                        <select
                          class="group-picker"
                          [value]="pickerValue(row)"
                          [attr.aria-label]="pickLabel(row)"
                          [attr.data-testid]="'select-' + row.key"
                          (change)="onPick(row.key, $event)"
                        >
                          <!-- A typed value matches nothing here, so the picker
                             shows blank rather than lying about the value. -->
                          <option value=""></option>
                          @for (opt of options(row); track opt.value) {
                            <option [value]="opt.value">{{ opt.label }}</option>
                          }
                        </select>
                      </div>
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
                      <!-- Typable, not an <output>. The steps are fine for a
                           nudge, but reaching 2.5 from 1 at 0.1 a click is
                           fifteen clicks, and the value was right there looking
                           like a field. Committed on change (blur/Enter), so a
                           half-typed "0." never reaches the renderer. -->
                      <input
                        class="stepper-value"
                        type="text"
                        inputmode="decimal"
                        [id]="row.key"
                        [value]="row.value"
                        [class.is-invalid]="error(row)"
                        [attr.aria-invalid]="error(row) ? 'true' : null"
                        [attr.aria-errormessage]="
                          error(row) ? row.key + '-error' : null
                        "
                        [attr.data-testid]="'input-' + row.key"
                        (change)="setFromStepperInput(row, $event)"
                      />
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

                    @if (error(row); as message) {
                      <!-- Under the field, not in a tooltip: you are looking at
                           the thing you just mistyped, and the rule you broke is
                           what tells you how to fix it. -->
                      <p
                        class="error"
                        role="alert"
                        [id]="row.key + '-error'"
                        [attr.data-testid]="'error-' + row.key"
                      >
                        {{ message }}
                      </p>
                    }
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

    /* Type-or-pick as ONE control: the border belongs to the group, and the two
       children sit inside it with no seam. Stacking a select above a text input
       read as two unrelated fields. */
    .input-group {
      display: flex;
      align-items: stretch;
      block-size: 28px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      overflow: hidden;
    }

    .input-group:focus-within {
      border-color: var(--brand);
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }

    .group-field {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
      padding-inline: var(--space-1);
    }

    /* The field owns the focus ring for the whole group. */
    .group-field:focus-visible {
      outline: none;
    }

    /* Collapsed to its chevron: the native select is the popup, the input is the
       value. Widening it would re-introduce the second field we just removed. */
    .group-picker {
      inline-size: 22px;
      border: 0;
      border-inline-start: 1px solid var(--border);
      background: var(--surface-sunken);
      color: var(--text-muted);
      font: inherit;
      cursor: pointer;
      /* Hides the select's own text, leaving only its arrow. */
      text-indent: -100px;
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
    /* 3ch fitted the old read-only <output>, which never showed more than "1".
       A typable field has to hold what someone types into it — "0.5" was being
       clipped to "0." the moment padding moved off its default. */
    .stepper {
      display: grid;
      grid-template-columns: 32px minmax(5ch, 1fr) 32px;
      align-items: center;
      gap: var(--space-1);
      justify-content: start;
      max-inline-size: 180px;
    }

    .stepper-value {
      inline-size: 100%;
      min-inline-size: 0;
      block-size: 32px;
      padding-inline: var(--space-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font-family: var(--font-ui);
      text-align: center;
      font-size: var(--text-sm);
      /* Lining figures, so the value doesn't jitter as digits change. */
      font-variant-numeric: tabular-nums;
    }

    .stepper-value:focus-visible {
      border-color: var(--brand);
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }

    /* Not colour alone: the message below says what is wrong in words, so this
       is the mark that draws the eye to which field it is about. */
    .stepper-value.is-invalid {
      border-color: var(--danger);
      background: var(--danger-subtle);
    }

    .error {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--danger);
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

  protected readonly inheritedLabel = $localize`:@@settings.inherited:Inherited`;
  protected readonly resetLabel = $localize`:@@settings.reset:Reset to inherited`;
  protected readonly resetDefaultLabel = $localize`:@@settings.resetDefault:Reset to default`;

  private readonly rows = computed<Row[]>(() =>
    keysForScope(this.scope()).map((key) => {
      const own = this.values()[key];
      const isOverridden = own !== undefined;
      const value = isOverridden
        ? own
        : (this.inherited()[key] ?? SETTINGS[key].default);
      return { key, ui: SETTING_UI[key], value, isOverridden };
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
    this.clearError(row.key);
    this.set(row.key, Math.min(max, Math.max(min, rounded)));
  }

  /** Blank unless the value happens to be one of the named answers. */
  protected pickerValue(row: Row): string {
    const match = this.options(row).some((o) => o.value === String(row.value));
    return match ? String(row.value) : '';
  }

  protected pickLabel(row: Row): string {
    return $localize`:@@settings.choose:Choose ${row.ui.label}:setting:`;
  }

  protected onPick(key: SettingKey, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // The blank row is a display state, not a choice — picking it would wipe a
    // typed value for no reason.
    if (value !== '') {
      this.set(key, value);
    }
  }

  protected set(key: SettingKey, value: unknown): void {
    this.changed.emit({ [key]: value });
  }

  protected setFromInput(key: SettingKey, event: Event): void {
    this.set(key, (event.target as HTMLInputElement).value);
  }

  /** A `select` row with no `custom` flag is a closed list — dropdown only. */
  protected allowsCustom(row: Row): boolean {
    return row.ui.control.kind === 'select' && row.ui.control.custom === true;
  }

  /**
   * Why a typed stepper value was refused, or null while it is fine.
   *
   * Keyed per row, because two rows can be wrong at once and each has to say
   * which. Cleared the moment a row becomes valid again.
   */
  private readonly errors = signal<ReadonlyMap<SettingKey, string>>(new Map());

  protected error(row: Row): string | null {
    return this.errors().get(row.key) ?? null;
  }

  /**
   * Validate a typed stepper value; **refuse it rather than repair it**.
   *
   * An earlier version clamped silently — 99 columns became 3 — which is a guess
   * dressed up as an answer: it looks like the app accepted what you typed, and
   * you only find out it did not by re-reading the field. Saying "1 to 6" and
   * keeping your text on screen lets you correct it; quietly rewriting it does
   * not.
   *
   * **Whole vs fractional comes from the row's own `step`** rather than a second
   * list to keep in sync: a step of 1 is a counting setting (columns), anything
   * finer takes decimals (padding, chord size). Nothing is written while invalid,
   * so a half-typed value never reaches the renderer or the database.
   */
  protected setFromStepperInput(row: Row, event: Event): void {
    const field = event.target as HTMLInputElement;
    if (row.ui.control.kind !== 'stepper') {
      return;
    }
    const { min, max, step } = row.ui.control;
    // A comma is what half the world's keyboards put on the numeric key.
    const typed = Number(field.value.trim().replace(',', '.'));

    const problem = !Number.isFinite(typed)
      ? $localize`:@@settings.error.number:Enter a number.`
      : Number.isInteger(step) && !Number.isInteger(typed)
        ? $localize`:@@settings.error.whole:Whole numbers only.`
        : typed < min || typed > max
          ? $localize`:@@settings.error.range:Enter a value between ${min}:min: and ${max}:max:.`
          : null;

    const next = new Map(this.errors());
    if (problem === null) {
      next.delete(row.key);
      this.errors.set(next);
      this.set(row.key, typed);
      return;
    }
    next.set(row.key, problem);
    this.errors.set(next);
  }

  /** A step from the buttons is valid by construction — clear any typed error. */
  private clearError(key: SettingKey): void {
    if (!this.errors().has(key)) {
      return;
    }
    const next = new Map(this.errors());
    next.delete(key);
    this.errors.set(next);
  }

  protected reset(key: SettingKey): void {
    // Sparse storage (ADR-0006): resetting means REMOVING this scope's override
    // so the cascade resolves again, not writing the inherited value down.
    this.changed.emit({ [key]: undefined });
  }

  /** True when a Global value is still its registry default. Compared as text so
   * a `2` typed into a field reads equal to a `2` stepped into it. */
  protected isAtDefault(row: Row): boolean {
    return String(row.value) === String(SETTINGS[row.key].default);
  }

  /**
   * Reset a Global value to the registry default. Unlike `reset`, this emits the
   * default VALUE, not `undefined` — Global defines every setting, so there is no
   * override to remove and nothing below to fall back to (ADR-0006).
   */
  protected resetToDefault(key: SettingKey): void {
    this.changed.emit({ [key]: SETTINGS[key].default });
  }
}
