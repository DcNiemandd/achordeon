// Composition wiring — Epic 5
// Spec: ADR-0008 (the port is bound in the composition layer, not the domain)

import {
  inject,
  provideAppInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { ChordTheory } from '@achordeon/shared/domain';
import { TonalChordTheory } from './tonal-chord-theory/tonal-chord-theory';
import { ACHORDEON_DB } from './stores/repositories';
import { BootGate } from './persistence/boot-gate';
import { bootstrap } from './persistence/gateway';
import { seedDatabase } from './persistence/seed';
import { SettingsStore } from './stores/settings-store';
import { AuthService } from './auth/auth-service';
import { SyncService } from './sync/sync-service';

/**
 * Bind the ports `shared/domain` declares to the adapters that implement them.
 *
 * The domain owns the `ChordTheory` *port* and stays framework-free, so it cannot
 * name its own implementation; the app owns the composition but has no business
 * knowing that the implementation is tonal (ADR-0008: `@tonaljs/*` is quarantined
 * in this library). This function is where those two facts meet — one import in
 * `app.config.ts`, and swapping the engine stays a change inside this library.
 */
export function provideAchordeonData(): Provider[] {
  return [{ provide: ChordTheory, useClass: TonalChordTheory }];
}

/**
 * Run the ADR-0007 ingest gateway over the local database before anything reads a
 * row, and publish what it found.
 *
 * **Awaited on purpose.** The whole point of the gateway is that runtime code only
 * ever sees the current shape: if a list query ran first, it would read rows the
 * migration is about to rewrite. First paint waits for one read of the library and
 * (rarely) one rewrite — the one-time cost ADR-0007 accepts in exchange for having
 * no version checks scattered through the stores.
 *
 * A `refuse` leaves the database untouched and surfaces as `BootGate.mustUpdate`,
 * which the shell turns into the blocking update prompt (Epic 11).
 *
 * The saved global settings are hydrated here too, in the same awaited step and
 * after the gateway rather than before it: they are rows like any other, so they
 * must be read at the current shape, and they must be in the store before the
 * first render — a page that paints A4 and then jumps to the user's own aspect
 * ratio is a worse bug than the one this fixes. On a `refuse` there is nothing
 * safe to read, and the shell is about to demand an update anyway.
 */
export function provideAchordeonBoot(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const gate = inject(BootGate);
    const settings = inject(SettingsStore);
    const result = await bootstrap(inject(ACHORDEON_DB));
    gate.publish(result);
    if (result.status !== 'refuse') await settings.load();
  });
}

/**
 * Seed the starter library at boot **when the URL asks for it** (`?seed`).
 *
 * Opt-in on purpose. Auto-seeding every fresh database would resurrect the
 * samples for anyone who cleared them, and would replace the deliberate empty
 * state ("No songs yet") that the tests and a real first-run depend on. `?seed`
 * makes it a thing a developer does once — navigate to any route with the param —
 * rather than a behaviour the app has. `seedDatabase` is itself a no-op on a
 * non-empty library, so the lingering param never duplicates.
 *
 * An app initializer, so the rows exist before the first list query runs. It
 * awaits the seed — a handful of `bulkPut`s, a few milliseconds — so pane B is
 * never briefly empty on the boot that seeds.
 */
export function provideSeedOnDemand(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    if (
      typeof location === 'undefined' ||
      !new URLSearchParams(location.search).has('seed')
    ) {
      return;
    }
    await seedDatabase(inject(ACHORDEON_DB));
  });
}

/**
 * Start the account + sync layer at boot (Epic 10).
 *
 * `AuthService.init` reads the persisted session first, then `SyncService.init`
 * loads the toggle, wires the focus/blur handoff moments, and does a first pull.
 * Both degrade to no-ops without a backend or a session, so this is safe to run
 * on every build — the offline-only app simply finds nothing to do. Sync never
 * blocks the shell, so the initializer does not await it: a slow or failed pull
 * must not hold up first paint.
 */
export function provideAchordeonSync(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const auth = inject(AuthService);
    const sync = inject(SyncService);
    void auth.init().then(() => sync.init());
  });
}
