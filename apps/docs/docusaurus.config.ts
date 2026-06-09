import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// Angular app lives outside Docusaurus's route table — prefix internal-looking
// paths with `pathname://` so the broken-link checker treats them as external.
const rawAppLink = process.env.APP_LINK ?? '/achordeon/app/';
const appLink = /^([a-z]+:)?\/\//i.test(rawAppLink)
  ? rawAppLink
  : `pathname://${rawAppLink}`;

const repoUrl = 'https://github.com/dcniemandd/achordeon';

const baseUrl = process.env.DOCS_BASE_URL ?? '/achordeon/';

const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'cs'],
  localeConfigs: {
    en: { label: 'English', htmlLang: 'en-US' },
    cs: { label: 'Čeština', htmlLang: 'cs-CZ' },
  },
} satisfies Config['i18n'];

const localeRedirectScript = `(function () {
  try {
    var FLAG = 'achordeon-docs-locale-init';
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, '1');
    var SUPPORTED = ${JSON.stringify(i18n.locales)};
    var DEFAULT = ${JSON.stringify(i18n.defaultLocale)};
    var BASE = ${JSON.stringify(baseUrl)};
    var path = location.pathname;
    if (path.indexOf(BASE) !== 0) return;
    var seg = path.slice(BASE.length).split('/')[0];
    var current = SUPPORTED.indexOf(seg) >= 0 ? seg : DEFAULT;
    var nav = (navigator.language || DEFAULT).slice(0, 2).toLowerCase();
    var target = SUPPORTED.indexOf(nav) >= 0 ? nav : DEFAULT;
    if (target === current) return;
    var tail = path.slice(BASE.length + (current === DEFAULT ? 0 : current.length + 1));
    var dest = BASE + (target === DEFAULT ? '' : target + '/') + tail + location.search + location.hash;
    location.replace(dest);
  } catch (e) {}
})();`;

const config: Config = {
  title: 'Achordeon',
  tagline: 'Real-time channels, in harmony.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: process.env.DOCS_URL ?? 'https://dcniemandd.github.io',
  baseUrl,

  headTags: [
    {
      tagName: 'script',
      attributes: {},
      innerHTML: localeRedirectScript,
    },
  ],

  organizationName: 'dcniemandd',
  projectName: 'achordeon',
  trailingSlash: false,
  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n,

  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [{ from: '/docs', to: '/docs/intro' }],
      },
    ],
  ],

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
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: repoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    docs: {
      sidebar: { hideable: true },
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
