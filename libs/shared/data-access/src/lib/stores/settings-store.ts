// Settings store (hand-rolled) — Epic 4 ▸ subtask 4
// Spec: PRD-INFRASTRUCTURE.md §2/§3 (hand-rolled signal store for the small ones),
// ADR-0006 (Global scope = base of the cascade), §11 (theme + language prefs)

import { Injectable, signal } from '@angular/core';
import { SETTINGS, type GlobalSettings } from '@achordeon/shared/domain';

/** Application theme preference (PRD §11 / Epic 12). */
export type ThemeChoice = 'system' | 'light' | 'dark';
/** UI language (PRD §11: EN + CS). */
export type Language = 'en' | 'cs';

/**
 * The complete Global-scope settings bag from the registry defaults — the base of
 * the cascade (ADR-0006) before any User override is hydrated in. Derived from the
 * registry so a new setting appears here with zero extra wiring.
 */
export function defaultGlobalSettings(): GlobalSettings {
  const bag: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    bag[key] = def.default;
  }
  return bag as GlobalSettings;
}

/**
 * In-memory reactive holder for global render defaults + app preferences. Small
 * enough to hand-roll (§3) rather than reach for a SignalStore. Holds state only —
 * the boot gateway (subtask 6) hydrates it from the User record; feature panels
 * (Epic 12) call the setters and own the write-back. Effective per-song values are
 * resolved at render via `resolveSettings`, never stored here.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly _global = signal<GlobalSettings>(defaultGlobalSettings());
  private readonly _theme = signal<ThemeChoice>('system');
  private readonly _language = signal<Language>('en');

  readonly global = this._global.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly language = this._language.asReadonly();

  /** Seed from loaded state on boot; missing fields keep their current value. */
  hydrate(seed: {
    global?: GlobalSettings;
    theme?: ThemeChoice;
    language?: Language;
  }): void {
    if (seed.global) this._global.set(seed.global);
    if (seed.theme) this._theme.set(seed.theme);
    if (seed.language) this._language.set(seed.language);
  }

  /** Merge an override into the Global bag (sparse edit from the settings GUI). */
  setGlobal(patch: Partial<GlobalSettings>): void {
    this._global.update((g) => ({ ...g, ...patch }));
  }

  setTheme(theme: ThemeChoice): void {
    this._theme.set(theme);
  }

  setLanguage(language: Language): void {
    this._language.set(language);
  }
}
