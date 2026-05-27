import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Achordeon',
  tagline: 'Real-time channels, in harmony.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: process.env.DOCS_URL ?? 'https://dcniemandd.github.io',
  baseUrl: process.env.DOCS_BASE_URL ?? '/achordeon/',

  organizationName: 'dcniemandd',
  projectName: 'achordeon',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/dcniemandd/achordeon/tree/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Achordeon',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: process.env.APP_LINK ?? '/achordeon/app/',
          label: 'Launch App',
          position: 'right',
        },
        {
          href: 'https://github.com/dcniemandd/achordeon',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Project',
          items: [
            {label: 'Docs', to: '/docs/intro'},
            {label: 'Launch App', href: process.env.APP_LINK ?? '/achordeon/app/'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/dcniemandd/achordeon'},
          ],
        },
      ],
      copyright: `Achordeon — © ${new Date().getFullYear()} dcniemandd. MIT.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
