import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Angular app lives outside Docusaurus's route table — prefix internal-looking
// paths with `pathname://` so the broken-link checker treats them as external.
const rawAppLink = process.env.APP_LINK ?? '/achordeon/app/';
const appLink = /^([a-z]+:)?\/\//i.test(rawAppLink)
  ? rawAppLink
  : `pathname://${rawAppLink}`;

const repoUrl = 'https://github.com/dcniemandd/achordeon';

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

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

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
          editUrl: `${repoUrl}/tree/main/apps/docs/`,
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
          to: appLink,
          label: 'Launch App',
          position: 'right',
        },
        {
          href: repoUrl,
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
            { label: 'Docs', to: '/docs/intro' },
            { label: 'Launch App', href: appLink },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: repoUrl,
            },
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
