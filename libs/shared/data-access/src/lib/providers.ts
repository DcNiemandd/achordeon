// Composition wiring — Epic 5
// Spec: ADR-0008 (the port is bound in the composition layer, not the domain)

import {
  inject,
  provideAppInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { ChordTheory } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { ACHORDEON_DB } from './stores/repositories';
import { BootGate } from './persistence/boot-gate';
import { bootstrap } from './persistence/gateway';
import { applyFirstRun } from './persistence/guide-song';
import { ParserService } from './parser/parser-service';
import { SettingsStore } from './stores/settings-store';
import { AuthService } from './auth/auth-service';
import { SyncService } from './sync/sync-service';

/**
 * Bind the ports `shared/domain` declares to the adapters that implement them.
 *
 * The domain owns the `ChordTheory` *port* and stays framework-free, so it cannot
 * name its own implementation; the app owns the composition but has no business
 * knowing that the implementation is tonal (ADR-0008: `@tonaljs/*` is quarantined
 * in `shared/chord-theory`). This function is where those two facts meet — one
 * import in `app.config.ts`, and swapping the engine stays a change behind this
 * one line.
 *
 * `useFactory`, not `useClass`: the adapter is a plain framework-free class now
 * that the docs site constructs it too, and asking Angular to instantiate an
 * undecorated class is a rule about constructor arguments rather than a promise.
 * `new` says what is meant and cannot be surprised.
 */
export function provideAchordeonData(): Provider[] {
  return [{ provide: ChordTheory, useFactory: () => new TonalChordTheory() }];
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
 * The opt-out, sticky in `localStorage` (same idiom as the chosen language).
 *
 * Sticky rather than a param that has to ride on every URL because a test that
 * wants the empty state navigates many times after clearing the database, and each
 * of those navigations is a full boot that would seed again. `?empty` sets it;
 * nothing clears it from the URL, so opting back in means removing the key (which is
 * what the e2e suite does — see `playwright.config.ts`).
 */
const SEED_OFF_KEY = 'achordeon.seed';

/**
 * Give a first-time user something to look at, and keep it in their language.
 *
 * Two behaviours, one initializer, because they are one decision — *what a boot does
 * about content it did not find*:
 *
 * - **A fresh database** gets the starter library: the `@@songs.tutorial` tour in the
 *   language the app booted in, plus `seed.ts`'s songs, songbook and favourite. A
 *   blank library teaches nothing and renders nothing, and every module would open on
 *   its own empty state. The render pane's auto-selection
 *   (`SongsPresenter.autoSelect`) lands on the tour, which is the newest row. `guide`
 *   is passed in because the copy is `$localize`d and lives in the app
 *   (PRD-UI-SHELL.md §Where the help text lives) — this library must not hold it —
 *   and it is a factory so the message is read only on the boots that need it.
 * - **`?empty`** suppresses it, for the tests that assert the real empty state
 *   ("No songs yet") and for anyone who wants to see a first-run without content.
 *
 * `applyFirstRun` owns *when* it writes and re-language; the only thing decided here
 * is which of the two a boot is.
 *
 * An app initializer, awaited, so the row exists before the first list query runs —
 * pane B is never briefly empty on the boot that seeds. A refused boot writes
 * nothing at all: the ingest gateway has left the database alone on purpose
 * (ADR-0007) and the shell is about to demand an update, so seeding behind that
 * prompt would be writing into a library we have just admitted we cannot read.
 */
export function provideAchordeonSeed(
  guide: () => string,
): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const db = inject(ACHORDEON_DB);
    const parser = inject(ParserService);
    if (inject(BootGate).mustUpdate() || typeof location === 'undefined') {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.has('empty')) {
      // The param decides this boot whether or not the write stuck: with storage
      // blocked, `?empty` still has to mean empty.
      setSeedOff(true);
      return;
    }
    if (isSeedOff()) {
      return;
    }

    const content = guide();
    // Derived, not authored: `seed.ts` can hand-write its caches because its songs
    // are one fixed English set, but the guide song's title is whatever this
    // language's tour calls itself (PRD-DOMAIN-MODEL §Song — cache is derived).
    const ast = parser.parse(content);
    const title = ast.title ?? '';
    await applyFirstRun(db, {
      // The library label is the song's own title, so it needs no message of its
      // own — "My first song" and "Moje první píseň" are already translated.
      name: title,
      content,
      cache: { title, subtitle: ast.subtitle ?? '' },
    });
  });
}

function isSeedOff(): boolean {
  try {
    return localStorage.getItem(SEED_OFF_KEY) === 'off';
  } catch {
    // Private mode, or storage blocked. Seeding is the default answer.
    return false;
  }
}

function setSeedOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(SEED_OFF_KEY, 'off');
    else localStorage.removeItem(SEED_OFF_KEY);
  } catch {
    // The param still governs this boot; only its stickiness is lost.
  }
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
