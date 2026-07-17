// Composition wiring — Epic 5
// Spec: ADR-0008 (the port is bound in the composition layer, not the domain)

import type { Provider } from '@angular/core';
import { ChordTheory } from '@achordeon/shared/domain';
import { TonalChordTheory } from './tonal-chord-theory/tonal-chord-theory';

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
