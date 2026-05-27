# Achordeon

Real-time broadcast app — one sender, many receivers, shared state in the browser.

This is the monorepo for both the **Achordeon** product (Angular app) and its
documentation site (Docusaurus). Both deploy to GitHub Pages from a single
push to `main`.

## Layout

```
apps/
  app/    Angular application (the product)
  docs/   Docusaurus landing + docs site
libs/     Shared libraries (added as needed)
```

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 11+ (Corepack: `corepack enable && corepack prepare pnpm@latest --activate`)

## Quick start

```bash
pnpm install

pnpm dev:app    # Angular dev server  → http://localhost:4200
pnpm dev:docs   # Docusaurus dev server → http://localhost:3000

pnpm build      # Build both apps
pnpm lint       # Lint both apps
pnpm test       # Run unit tests
```

## URLs

Phase 1 (current — GitHub Pages, no custom domain):

| URL                                                | Content              |
| -------------------------------------------------- | -------------------- |
| `https://dcniemandd.github.io/achordeon/`          | Landing page         |
| `https://dcniemandd.github.io/achordeon/docs/intro`| Documentation        |
| `https://dcniemandd.github.io/achordeon/app/`      | Achordeon app        |

Phase 2 (planned — custom apex domain): toggle the env vars in
`.github/workflows/deploy.yml` to point `DOCS_BASE_URL=/`, `APP_BASE_HREF=/app/`,
`APP_LINK=/app/`, `DOCS_URL=https://<domain>`. Add a CNAME file under
`apps/docs/static/`.

## Deploying

Push to `main` triggers `.github/workflows/deploy.yml`:

1. **verify** — lint, test, build (runs on all branches + PRs).
2. **deploy** — only on push to `main`. Builds both apps with the env vars
   above, assembles `dist/site/`, copies `index.html` → `404.html` under
   `dist/site/app/` (SPA fallback for Angular's PathLocationStrategy on Pages),
   uploads as a Pages artifact, deploys.

Repo settings → Pages → Source must be set to **GitHub Actions**.

## License

MIT — see [LICENSE](./LICENSE).
