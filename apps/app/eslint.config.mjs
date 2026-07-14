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
      // First match wins, so order matters: shell + shared before the
      // generic feature pattern.
      'boundaries/elements': [
        // Root app files (app.ts, app.routes.ts, app.config.ts, ...).
        { type: 'shell', mode: 'file', pattern: 'apps/app/src/app/*.ts' },
        // In-app common: any feature may import it; it imports no feature.
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
              allow: { to: { type: 'app-shared' } },
            },
            {
              // Each root file is its own "file"-mode element, so
              // the shell wiring itself (config -> routes) is
              // shell -> shell and must be allowed too.
              from: { type: 'shell' },
              allow: { to: { type: ['shell', 'feature', 'app-shared'] } },
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
