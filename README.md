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

GitHub Pages, served under the custom apex domain `achordeon.eu`:

| URL                               | Content       |
| --------------------------------- | ------------- |
| `https://achordeon.eu/`           | Landing page  |
| `https://achordeon.eu/docs/intro` | Documentation |
| `https://achordeon.eu/app/`       | Achordeon app |

The domain is claimed by `apps/docs/static/CNAME` (copied to the site root by the
Docusaurus build). DNS: apex `A`/`AAAA` records to GitHub's Pages IPs, `www`
`CNAME` to `dcniemandd.github.io`.

Where the two apps think they live comes from four variables — `DOCS_URL`,
`DOCS_BASE_URL`, `APP_BASE_HREF`, `APP_LINK`. In CI they are repo **variables**
(Settings ▸ Secrets and variables ▸ Actions ▸ Variables); the workflow falls back
to the values above when a variable is unset. Locally they are optional: Nx loads
`.env.local` into every task it runs, so uncommenting them in your `.env.local`
(see `.env.local.example`) reproduces a deploy build, and leaving them out gives
you the same paths from the defaults in `apps/docs/docusaurus.config.ts` and
`apps/app/project.json`.

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
