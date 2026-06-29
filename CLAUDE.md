<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Documentation (apps/docs)

The `docs` project is a Docusaurus PRD site under `apps/docs`. Build/validate with
`pnpm nx build docs` (builds `en` + `cs`, fails on broken links) after editing `.mdx`.

- `/CONTEXT.md` is the domain glossary (ubiquitous language) and the source of truth
  for terminology and resolved decisions.
- `/docs/adr/` holds Architecture Decision Records. These live at the repo root and
  are **not** part of the docs site - do not publish or link them from `.mdx` pages.
- Editing existing docs: preserve the author's original wording and grammar. Only fix
  factual bugs or add missing parts; don't rewrite or "improve" prose.
- `<Image alt="..." />` (no `src`) renders a TODO placeholder; add `isDesign` for a
  design-mockup admonition. Component: `apps/docs/src/theme/MDXComponents/Img`.

## User usage of Claude

The user wants to learn and find the solutions himself. Never give him final solution. You can give options of an abstract data flow.
