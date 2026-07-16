import nx from '@nx/eslint-plugin';
import boundaries from 'eslint-plugin-boundaries';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  // --- Intra-app scope isolation (features are folders, not projects).
  // The Nx project rule guards app<->shared-lib edges; this guards
  // feature<->feature edges inside the one app project. ---
  {
    files: ['apps/app/src/app/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // First match wins, so order matters: shell + primitives + shared
      // before the generic feature pattern.
      'boundaries/elements': [
        // Root app files (app.ts, app.routes.ts, app.config.ts, ...).
        { type: 'shell', mode: 'file', pattern: 'apps/app/src/app/*.ts' },
        // The floor of the import ladder: imports node_modules ONLY.
        { type: 'primitives', pattern: 'apps/app/src/app/primitives' },
        // In-app common (incl. shared/layout): any feature may import it; it
        // imports primitives + domain types, never a feature, never a store.
        { type: 'app-shared', pattern: 'apps/app/src/app/shared' },
        // One element per feature folder; capture the scope name.
        { type: 'feature', pattern: 'apps/app/src/app/*', capture: ['scope'] },
      ],
      'boundaries/include': ['apps/app/src/app/**/*'],
      // Boundaries bundles eslint-import-resolver-node; teach it to
      // resolve extensionless .ts imports (else every import is "unknown"
      // and silently skipped).
      'import/resolver': {
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
      },
    },
    rules: {
      // Same-element imports are "internal" and shared-lib imports are
      // "unknown-local" - both ignored by default. So we only deny by
      // default and allow the few real edges.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Boundary violation: a feature folder may not import a sibling feature. Share via app/shared or a shared lib.',
          rules: [
            {
              from: { type: 'feature' },
              allow: { to: { type: ['app-shared', 'primitives'] } },
            },
            {
              // The import ladder (PRD-UI-SHELL.md §3): shared may reach
              // down to primitives and no further sideways.
              from: { type: 'app-shared' },
              allow: { to: { type: 'primitives' } },
            },
            // `primitives` gets no rule at all: default 'disallow' means it
            // can import nothing in-repo, which is exactly the contract.
            {
              // Each root file is its own "file"-mode element, so
              // the shell wiring itself (config -> routes) is
              // shell -> shell and must be allowed too.
              from: { type: 'shell' },
              allow: {
                to: { type: ['shell', 'feature', 'app-shared', 'primitives'] },
              },
            },
          ],
        },
      ],
    },
  },
  // --- The rest of the import ladder (PRD-UI-SHELL.md §3).
  // `boundaries` only sees in-app edges; the Nx project rule only sees
  // app<->lib edges. Neither can express "this FOLDER may not import that
  // LIB", so the two rungs that reach out to libs/ are guarded here. ---
  {
    files: ['apps/app/src/app/primitives/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@achordeon/*'],
              message:
                'primitives/ is the floor of the import ladder: node_modules only, nothing in-repo — not even domain types. A primitive must be liftable into an unrelated app unchanged.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/app/src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@achordeon/shared/data-access'],
              message:
                'app/shared may import @achordeon/shared/domain (pure types, no state) but never data-access. Components never inject a store — that is the presenter rule (PRD-UI-SHELL.md §3).',
            },
          ],
        },
      ],
    },
  },
  // --- The presenter rule, mechanized: components bind to a presenter, and
  // only the presenter knows the business layer exists. ---
  {
    files: [
      'apps/app/src/app/*/**/*.page.ts',
      'apps/app/src/app/*/**/*.component.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@achordeon/shared/data-access'],
              message:
                'Components never inject a store or a service — bind to the feature presenter instead (PRD-UI-SHELL.md §3). This is what lets the UI be deleted without touching the business layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
