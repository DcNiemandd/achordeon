// Settings panel — Epic 13
// Spec: PRD-UI-SHELL.md §4 (one panel, three homes)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SETTINGS } from '@achordeon/shared/domain';
import { Button, Icon, Tooltip } from '../../primitives';
import { ScreenShape } from '../layout';
import { MATCH_SCREEN } from './aspect-options';
import {
  GROUPS,
  GROUP_LABELS,
  SETTING_UI,
  keysForScope,
  type Group,
  type Option,
  type OptionGroup,
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
 * feature's thin wrapper binds it to that feature's presenter. (It does inject
 * `ScreenShape`, which is neither: a reading of `window.screen` that only the
 * browser can answer, and that all three hosts would otherwise answer alike.)
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
  imports: [Button, Icon, Tooltip, NgTemplateOutlet],
  template: `
    <!-- The option markup, written once for both selects below: a closed list and
         a collapsed picker differ in how they are worn, not in what they offer.
         Duplicating it is how one of them would quietly stop honouring groups. -->
    <ng-template #optionList let-row>
      <!-- Tracked by position: a row's groups are a fixed list that never
           reorders, and two runs of ungrouped options would both key on the same
           empty label. -->
      @for (group of optionGroups(row); track $index) {
        @if (group.label) {
          <optgroup [label]="group.label">
            @for (opt of group.options; track opt.value) {
              <option [value]="opt.value">{{ opt.label }}</option>
            }
          </optgroup>
        } @else {
          @for (opt of group.options; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        }
      }
    </ng-template>

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
                      @for (opt of choices(row); track opt.value) {
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
                        (change)="setFromInput(row, $event)"
                      >
                        <ng-container
                          [ngTemplateOutlet]="optionList"
                          [ngTemplateOutletContext]="{ $implicit: row }"
                        />
                      </select>
                    } @else {
                      <!-- One control, not two: the field always shows the value
                         and always takes a typed one; the chevron is a shortcut
                         to the named answers. There is no "custom mode" to be
                         in, so there is no way to be stuck in it. -->
                      <div class="input-group" [class.is-invalid]="error(row)">
                        <input
                          class="group-field"
                          type="text"
                          [id]="row.key"
                          [value]="row.value"
                          [class.is-invalid]="error(row)"
                          [attr.aria-invalid]="error(row) ? 'true' : null"
                          [attr.aria-errormessage]="
                            error(row) ? row.key + '-error' : null
                          "
                          [attr.data-testid]="'input-' + row.key"
                          (change)="setFromInput(row, $event)"
                        />
                        <select
                          class="group-picker"
                          [value]="pickerValue(row)"
                          [attr.aria-label]="pickLabel(row)"
                          [attr.data-testid]="'select-' + row.key"
                          (change)="onPick(row, $event)"
                        >
                          <!-- A typed value matches nothing here, so the picker
                             shows blank rather than lying about the value. -->
                          <option value=""></option>
                          <ng-container
                            [ngTemplateOutlet]="optionList"
                            [ngTemplateOutletContext]="{ $implicit: row }"
                          />
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
                      (change)="setFromInput(row, $event)"
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

                      @for (preset of presets(row); track preset.value) {
                        <!-- A named value that is not a number, sitting with the
                             stepper rather than in a separate control: "auto" is
                             one of the answers to "how big", not a mode. -->
                        <button
                          appButton
                          type="button"
                          variant="ghost"
                          class="preset"
                          [class.is-active]="isPreset(row, preset.value)"
                          [attr.aria-pressed]="isPreset(row, preset.value)"
                          [attr.data-testid]="row.key + '-' + preset.value"
                          (click)="setPreset(row.key, preset.value)"
                        >
                          {{ preset.label }}
                        </button>
                      }
                    </div>
                  }
                }

                @if (error(row); as message) {
                  <!-- Outside the switch, because any control that takes typed
                       text can be wrong — not just the stepper. Under the field
                       rather than in a tooltip: you are looking at the thing you
                       just mistyped, and the rule you broke is what tells you how
                       to fix it. -->
                  <p
                    class="error"
                    role="alert"
                    [id]="row.key + '-error'"
                    [attr.data-testid]="'error-' + row.key"
                  >
                    {{ message }}
                  </p>
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

    /* The inset is the HOST's to decide, because the three homes pad
       differently: a dialog gives the panel the whole surface (so the panel
       pads itself), while the Settings page drops it into a section that is
       already padded (so a second inset would indent the render rows out of
       line with every other row on the page). One custom property, defaulted to
       what the dialogs want. */
    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--panel-inset, var(--space-3));
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
    /* 3ch fitted the old read-only output, which never showed more than "1".
       A typable field has to hold what someone types into it — "0.5" was being
       clipped to "0." the moment padding moved off its default. */
    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      max-inline-size: 240px;
    }

    .stepper > button {
      flex: none;
    }

    .preset {
      padding-inline: var(--space-2);
      font-size: var(--text-xs);
    }

    .stepper-value {
      flex: 1;
      inline-size: 100%;
      min-inline-size: 5ch;
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
    /* The group draws the border, not the field inside it — marking the input
       would have set a border-color on an element whose border is 0. */
    .stepper-value.is-invalid,
    .input-group.is-invalid {
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

  /**
   * The one dependency this panel has, and it is not state: a probe for the
   * shape of the screen it is running on (`ScreenShape`). "Match this screen" is
   * a question only the browser can answer, and the alternative — bubbling it out
   * for each of the three hosts to answer identically — would spread one reading
   * of `window.screen` across three features.
   */
  private readonly screen = inject(ScreenShape);

  /**
   * Whether this device can be measured at all, decided once.
   *
   * A host without a `screen` (jsdom, anything non-browser) gets no row rather
   * than a row that does nothing when tapped. The *value* is read again on the
   * tap itself, because that is when the orientation is known.
   */
  private readonly canMatchScreen = this.screen.detect() !== null;

  protected choices(row: Row): readonly Option[] {
    return row.ui.control.kind === 'choice' ? row.ui.control.options : [];
  }

  /**
   * A `select`'s options as groups, flat lists included.
   *
   * Bare options collapse into a run with **no label**, which the template
   * renders without an `<optgroup>` wrapper — so `titleFont` keeps its four plain
   * options while `aspectRatio` gets its headings, from one code path. A *run*
   * rather than one group per option, so a flat list is one block of markup and
   * an ungrouped option keeps its place among grouped ones.
   *
   * Also where "Match this screen" disappears on a host that cannot measure one:
   * filtered by value, so the rule holds wherever the row lists it, and a group
   * left empty by the filter drops out rather than showing a bare heading.
   */
  protected optionGroups(row: Row): readonly OptionGroup[] {
    if (row.ui.control.kind !== 'select') {
      return [];
    }

    const groups: OptionGroup[] = [];
    for (const entry of row.ui.control.options) {
      if ('options' in entry) {
        groups.push(entry);
        continue;
      }
      const run = groups[groups.length - 1];
      if (run?.label === '') {
        groups[groups.length - 1] = {
          label: '',
          options: [...run.options, entry],
        };
      } else {
        groups.push({ label: '', options: [entry] });
      }
    }

    return groups
      .map((group) => ({
        label: group.label,
        options: group.options.filter(
          (opt) => opt.value !== MATCH_SCREEN || this.canMatchScreen,
        ),
      }))
      .filter((group) => group.options.length > 0);
  }

  /** Every option a `select` row offers, groups flattened away. */
  private pickable(row: Row): readonly Option[] {
    return this.optionGroups(row).flatMap((group) => group.options);
  }

  protected canStep(row: Row, direction: number): boolean {
    if (row.ui.control.kind !== 'stepper') {
      return false;
    }
    const { min, max, step } = row.ui.control;
    const next = this.stepperNumber(row) + step * direction;
    return next >= min && next <= max;
  }

  protected step(row: Row, direction: number): void {
    if (row.ui.control.kind !== 'stepper') {
      return;
    }
    const { min, max, step } = row.ui.control;
    // From a preset, stepping starts at the number that preset behaves like —
    // nudging away from "auto" should land next to it, not at the range's floor.
    const next = this.stepperNumber(row) + step * direction;
    // Float steps accumulate error: 1.1 + 0.1 = 1.2000000002.
    const rounded = Math.round(next * 100) / 100;
    this.setError(row.key, null);
    this.set(row.key, Math.min(max, Math.max(min, rounded)));
  }

  /** Blank unless the value happens to be one of the named answers. */
  protected pickerValue(row: Row): string {
    const match = this.pickable(row).some((o) => o.value === String(row.value));
    return match ? String(row.value) : '';
  }

  protected pickLabel(row: Row): string {
    return $localize`:@@settings.choose:Choose ${row.ui.label}:setting:`;
  }

  protected onPick(row: Row, event: Event): void {
    const picked = (event.target as HTMLSelectElement).value;
    // The blank row is a display state, not a choice — picking it would wipe a
    // typed value for no reason.
    if (picked === '') {
      return;
    }

    // "Match this screen" is an action wearing an option's clothes: it stands for
    // a measurement, so what gets stored is the measurement. Storing the sentinel
    // would make the setting mean "whatever device is reading it", and the shape
    // of a song would change when it synced to a desktop.
    const value = picked === MATCH_SCREEN ? this.screen.detect() : picked;
    if (value === null) {
      return;
    }

    // A listed option is legal by construction, so picking one is also how you
    // get out of an error you typed yourself.
    this.setError(row.key, null);
    this.set(row.key, value);
  }

  protected set(key: SettingKey, value: unknown): void {
    this.changed.emit({ [key]: value });
  }

  /**
   * A typed value from a free-text control, validated before it is stored.
   *
   * Same contract as the stepper: refused rather than repaired, your text left
   * on screen to correct, and nothing written while it is wrong.
   */
  protected setFromInput(row: Row, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const problem = row.ui.validate?.(raw) ?? null;
    this.setError(row.key, problem);
    if (problem === null) {
      this.set(row.key, raw);
    }
  }

  /** A preset beside a stepper (`scale: auto`) — not a number, and always legal. */
  protected setPreset(key: SettingKey, value: string): void {
    this.setError(key, null);
    this.set(key, value);
  }

  protected presets(row: Row): readonly Option[] {
    return row.ui.control.kind === 'stepper'
      ? (row.ui.control.presets ?? [])
      : [];
  }

  protected isPreset(row: Row, value: string): boolean {
    return String(row.value) === value;
  }

  /** The number a stepper starts from when the value is currently a preset. */
  private stepperNumber(row: Row): number {
    const asNumber = Number(row.value);
    return Number.isFinite(asNumber) ? asNumber : 1;
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

  /** Record or clear one row's complaint, leaving the other rows alone. */
  private setError(key: SettingKey, message: string | null): void {
    if ((this.errors().get(key) ?? null) === message) {
      return;
    }
    const next = new Map(this.errors());
    if (message === null) {
      next.delete(key);
    } else {
      next.set(key, message);
    }
    this.errors.set(next);
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
    const { min, max, step, presets } = row.ui.control;
    const raw = field.value.trim();

    // A preset typed out by hand ("auto") is exactly as legal as clicking it.
    if (presets?.some((preset) => preset.value === raw)) {
      this.setError(row.key, null);
      this.set(row.key, raw);
      return;
    }

    // A comma is what half the world's keyboards put on the numeric key.
    const typed = Number(raw.replace(',', '.'));
    const names = presets?.map((preset) => preset.label).join(', ');

    const problem =
      !Number.isFinite(typed) || raw === ''
        ? names
          ? $localize`:@@settings.error.numberOrPreset:Enter a number, or ${names}:presets:.`
          : $localize`:@@settings.error.number:Enter a number.`
        : Number.isInteger(step) && !Number.isInteger(typed)
          ? $localize`:@@settings.error.whole:Whole numbers only.`
          : typed < min || typed > max
            ? $localize`:@@settings.error.range:Enter a value between ${min}:min: and ${max}:max:.`
            : null;

    this.setError(row.key, problem);
    if (problem === null) {
      this.set(row.key, typed);
    }
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
