import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/build',
      '**/.docusaurus',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // --- scope: the app consumes shared; shared stays self-contained.
            // Per-feature scope isolation lives in eslint-plugin-boundaries
            // (features are folders in the app, not projects). ---
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            // --- type: enforce the layer cake (domain is the purest floor) ---
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:domain'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util', 'type:domain'],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [
                'type:data-access',
                'type:domain',
                'type:util',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:domain', 'type:util'],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:domain',
                'type:util',
              ],
            },
          ],
        },
      ],
    },
  },
  // --- PRD-INFRASTRUCTURE.md §7, mechanized: song content renders to HTML and is
  // user input, so it is never handed to `innerHTML` and never wrapped in
  // `bypassSecurityTrust*`. Angular's escaping is the whole of that defence, and
  // one binding is all it takes to switch it off — which is why this is a rule and
  // not a paragraph. Workspace-wide, because the render pipeline spans
  // `libs/shared/render-core`, `libs/shared/data-access` and the app.
  //
  // The icon primitive is the single, deliberate exception: its markup is a
  // build-time constant generated from `lucide-static`, with no user input
  // anywhere near it (see the comment in icon.ts).
  {
    files: ['**/*.ts'],
    ignores: ['**/primitives/icon/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[property.name=/^bypassSecurityTrust(Html|Style|Script|Url|ResourceUrl)$/]',
          message:
            'No `bypassSecurityTrust*` outside the icon primitive (PRD-INFRASTRUCTURE.md §7). Rendered song content is user input — let Angular escape it.',
        },
        {
          selector: 'MemberExpression[property.name=/^(inner|outer)HTML$/]',
          message:
            'No `innerHTML`/`outerHTML` (PRD-INFRASTRUCTURE.md §7). Build DOM or bind text — rendered song content is user input.',
        },
        {
          // Inline templates are template literals to ESLint, so this has to look
          // at the string itself. Crude on purpose: `[innerHTML]` in a template is
          // exactly the thing being banned, and a false positive costs a reword.
          selector: 'TemplateElement[value.raw=/\\[(inner|outer)HTML\\]/]',
          message:
            'No `[innerHTML]` binding (PRD-INFRASTRUCTURE.md §7). Rendered song content is user input — let Angular escape it.',
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
