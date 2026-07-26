// Settings store (hand-rolled) — Epic 4 ▸ subtask 4
// Spec: PRD-INFRASTRUCTURE.md §2/§3 (hand-rolled signal store for the small ones),
// ADR-0006 (Global scope = base of the cascade), §11 (theme + language prefs)

import { Injectable, inject, signal } from '@angular/core';
import {
  LOCAL_USER_ID,
  SETTINGS,
  type GlobalSettings,
  type User,
} from '@achordeon/shared/domain';
import { USER_REPOSITORY } from './repositories';

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
 * Reactive holder for global render defaults + app preferences. Small enough to
 * hand-roll (§3) rather than reach for a SignalStore. Effective per-song values
 * are resolved at render via `resolveSettings`, never stored here.
 *
 * The global bag is **persisted**, in the single `User` row (ADR-0006: Global is
 * the base of the cascade, and a base that resets on reload is not a default —
 * it is a session). `load()` hydrates it at boot and `setGlobal` writes it back;
 * because it is a synced row, changing a default here travels to the user's other
 * devices like any other edit.
 *
 * Theme and language are the exceptions, and stay in memory here: neither can be
 * recovered from IndexedDB early enough to be read before first paint, so each
 * lives where it can be — the theme in a pre-paint localStorage cache, the
 * language in the URL (one sub-path per locale). The root shell seeds both.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly users = inject(USER_REPOSITORY);

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
    if (seed.global) this._global.set(completeGlobal(seed.global));
    if (seed.theme) this._theme.set(seed.theme);
    if (seed.language) this._language.set(seed.language);
  }

  /**
   * Read the saved global settings off the account row — the boot half of the
   * round-trip, awaited by the boot initializer so the first render already has
   * the user's defaults rather than the registry's.
   *
   * An absent row is the normal first-run state, not an error: the row is written
   * the first time a setting is changed, so a library nobody has configured has
   * nothing to load and keeps the registry defaults.
   */
  async load(): Promise<void> {
    const row = await this.users.get(LOCAL_USER_ID);
    if (row === undefined || row.deletedAt !== null) return;
    this._global.set(completeGlobal(row.settings));
  }

  /**
   * Merge an override into the Global bag (sparse edit from the settings GUI) and
   * write it through to the account row.
   *
   * The signal moves first, so the UI never waits on IndexedDB; the returned
   * promise settles when the write lands, which is what tests await. A failed
   * write is swallowed on purpose — a preference that could not be saved must not
   * take down the page that set it, and the next edit retries the whole bag
   * anyway.
   */
  setGlobal(patch: Partial<GlobalSettings>): Promise<void> {
    this._global.update((g) => ({ ...g, ...patch }));
    return this.persist();
  }

  setTheme(theme: ThemeChoice): void {
    this._theme.set(theme);
  }

  setLanguage(language: Language): void {
    this._language.set(language);
  }

  /**
   * Be told when a global change has been written to the account row.
   *
   * The sync layer's cue: a changed default is a synced row like a saved song, so
   * it has to reach the cloud the same way — `SyncService` registers `pushSoon`
   * here at boot. It is a listener rather than a call into `SyncService` because
   * the dependency only runs one way (sync reads this store to reflect a pull);
   * calling back the other way would close the circle. Same shape as
   * `WarnUnsynced.connect` / `ThemeApplier.connect`, one layer down.
   *
   * Fired after the write lands, not when the signal moves: the listener's first
   * act is to look at the row.
   */
  onSaved(listener: () => void): void {
    this.listeners.push(listener);
  }

  // --- write-back -------------------------------------------------------------

  private readonly listeners: (() => void)[] = [];

  /** The tail of the write chain — see `persist`. */
  private writing: Promise<void> = Promise.resolve();

  /**
   * Queue a write of the current bag behind the last one.
   *
   * Serialised rather than concurrent because each write is a read-modify-write
   * of one row: two overlapping ones would both read the pre-edit row and the
   * loser would write back a bag missing the winner's change. Dragging a slider
   * fires exactly that pattern.
   */
  private persist(): Promise<void> {
    const settings = this._global();
    this.writing = this.writing.then(
      () => this.write(settings),
      () => this.write(settings),
    );
    return this.writing;
  }

  private async write(settings: GlobalSettings): Promise<void> {
    try {
      const now = Date.now();
      const existing = await this.users.get(LOCAL_USER_ID);
      const row: User = {
        // A first-run row, filled in by whoever owns each field later: the
        // username when the account is named, the plan cache when a tier is read.
        username: '',
        planCache: 'free',
        createdAt: now,
        ...existing,
        id: LOCAL_USER_ID,
        settings,
        // Bumped so per-row LWW (ADR-0004) carries the change to the cloud, and
        // cleared so changing a setting on a device whose account was
        // soft-deleted revives the row rather than editing a tombstone.
        updatedAt: now,
        deletedAt: null,
      };
      await this.users.put(row);
    } catch {
      // Storage said no (private mode, quota, a closed database). The in-memory
      // bag is still correct for this session; nothing above needs to know.
      return;
    }
    // Outside the try, and only once the row is really there: a listener that
    // pushes has nothing to push if the write failed, and one that throws is a
    // bug in the listener, not "storage said no".
    for (const listener of this.listeners) listener();
  }
}

/**
 * A stored bag brought up to the current registry — every known key present,
 * anything unrecognised carried through.
 *
 * Global is the base of the cascade (ADR-0006) and `resolveSettings` reads every
 * key off it, so it has to be complete. A bag saved before a setting existed is
 * not: it was complete when it was written. Unknown keys survive because the
 * stored bag spreads last — a newer build's setting round-trips through this one
 * untouched (ADR-0007, preserve-unknown).
 */
function completeGlobal(stored: GlobalSettings): GlobalSettings {
  return { ...defaultGlobalSettings(), ...stored };
}
