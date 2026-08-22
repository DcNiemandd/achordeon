# Docs screenshots

Regenerates the images the docs site uses (`apps/docs/static/img/`). It drives
the real app with Playwright, so a screenshot is always the app as it actually
renders — seeded with the starter library, forced to the light theme, and
captured in both English and Czech.

This is **not** part of `nx e2e`. It writes files; it does not assert.

## Run

```sh
nx run app-e2e:shots
```

The app dev server is started automatically (an already-running one is reused).
Output:

- English → `apps/docs/static/img/screenshot-<name>.png`
- Czech → `apps/docs/static/img/cs/screenshot-<name>.png`

One shot, or a few:

```sh
cd apps/app-e2e
pnpm exec playwright test --config=playwright.shots.config.ts -g editor
```

## Add a shot

Add an entry to `SHOTS` in `manifest.ts`. Two kinds:

- **view** — navigate, name a `ready` selector, and it screenshots the page (or
  the `clip` element). Set `capture: { mode: 'view' }`.
- **export** — the app itself produces the picture (e.g. the song render PNG);
  `capture.act` triggers the download and the harness saves it.

Defaults: 1440×900, retina (`deviceScaleFactor: 2`), both locales. Override
`viewport`, `deviceScaleFactor`, or `locales` per shot — a content-only picture
(a rendered song) sets `locales: ['en']`, since it does not change with the UI
language.

Wiring the PNGs into the `.mdx` `<Image>` placeholders is a separate, manual
step — the harness only produces the files.
