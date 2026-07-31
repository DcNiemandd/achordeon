# shared-chord-theory

The `@tonaljs/*` adapter for the `ChordTheory` port (ADR-0008) — the one and only
file in the workspace that imports the engine.

Framework-free on purpose: the port is asked the same question by the Angular app
(through DI) and by the docs site's live syntax examples (directly), and a
`@Injectable` here would have made the second one impossible.

## Running unit tests

Run `nx test shared-chord-theory` to execute the unit tests via [Jest](https://jestjs.io).
