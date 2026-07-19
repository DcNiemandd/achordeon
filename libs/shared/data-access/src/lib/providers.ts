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
import { seedDatabase } from './persistence/seed';

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
