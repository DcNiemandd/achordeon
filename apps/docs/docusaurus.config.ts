import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// Deploy-target values (`DOCS_URL`, `DOCS_BASE_URL`, `APP_LINK`) come from the
// environment: repo variables in CI, and locally whatever Nx loaded from
// `.env.local` — it feeds every task it runs. `||`, not `??`: an env var set to
// the empty string means "not configured" here, and a blank base path would
// build a site whose every asset link is broken.

const url = process.env.DOCS_URL || 'https://achordeon.eu';

// The Angular app lives outside Docusaurus's route table, and ONE bundle serves
// every language (PRD-INFRASTRUCTURE.md §11) — so its link must be ABSOLUTE.
// Anything site-relative goes through `<Link>`, which prepends the locale-aware
// baseUrl and sends Czech readers to /cs/app/, where nothing is served. (The
// `pathname://` escape only exempts a link from the broken-link checker; it does
// not stop the prefixing.) An absolute URL is external to Docusaurus on every
// count: no prefix, no route lookup, no link check.
const rawAppLink = process.env.APP_LINK || '/app/';
const appLink = /^([a-z]+:)?\/\//i.test(rawAppLink)
  ? rawAppLink
  : new URL(rawAppLink, url).href;

const repoUrl = 'https://github.com/dcniemandd/achordeon';

// Where the usage beacon points (docs/privacy.mdx). `/count` under this origin
// answers a GET with a 1x1 GIF, so counting needs no third-party script here at
// all — `src/clientModules/stats.ts` sends an Image and forgets it. Unset means
// no counting: the client module gets '' and returns early.
const rawGoatcounter = process.env.GOATCOUNTER_URL || '';
const goatcounterUrl =
  rawGoatcounter === ''
    ? ''
    : new URL(
        'count',
        rawGoatcounter.endsWith('/') ? rawGoatcounter : `${rawGoatcounter}/`,
      ).href;

const baseUrl = process.env.DOCS_BASE_URL || '/';

// `docusaurus start` vs `docusaurus build` — the CLI sets NODE_ENV before it
// evaluates this file, so the dev server can be told apart from a real build here.
//
// Dev is a different site in two ways that matter below: it serves ONE locale, at
// ONE origin, and that origin is not where the app is. So the two redirects and
// the locale dropdown are all deploy-only — see each one for why.
const isDev = process.env.NODE_ENV !== 'production';

const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'cs'],
  localeConfigs: {
    en: { label: 'English', htmlLang: 'en-US' },
    cs: { label: 'Čeština', htmlLang: 'cs-CZ' },
  },
} satisfies Config['i18n'];

/**
 * The site root IS the app.
 *
 * `/` (and each locale's root, `/cs/`) sends the visitor to the app instead of
 * showing the landing page. Runs in `<head>`, before the body paints, so there is
 * no flash of a page nobody asked for — the same trick the locale redirect below
 * uses, and it goes FIRST so that the app wins before a Czech browser gets
 * bounced to /cs/ and has to bounce again.
 *
 * Only the roots: every docs URL is left alone, which is the whole point of
 * matching the path exactly rather than by prefix. `location.replace`, so the
 * back button returns to wherever the visitor came from rather than to a page
 * that would immediately redirect again. Without JavaScript nothing happens and
 * the landing page is served as before, Launch App button and all — that is the
 * fallback, and it is why there is no <noscript> meta-refresh here (headTags are
 * emitted on every page, and a refresh tag would drag the docs along with it).
 */
const appRedirectScript = `(function () {
  try {
    var BASE = ${JSON.stringify(baseUrl)};
    var LOCALES = ${JSON.stringify(i18n.locales)};
    var DEFAULT = ${JSON.stringify(i18n.defaultLocale)};
    var roots = [BASE];
    for (var i = 0; i < LOCALES.length; i++) {
      if (LOCALES[i] !== DEFAULT) roots.push(BASE + LOCALES[i] + '/');
    }
    var path = location.pathname;
    if (path.charAt(path.length - 1) !== '/') path += '/';
    if (roots.indexOf(path) < 0) return;
    location.replace(${JSON.stringify(appLink)} + location.search + location.hash);
  } catch (e) {}
})();`;

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

  url,
  baseUrl,

  headTags: [
    // The vector favicon, beside the `.ico` above. Both come out of the app's
    // `tools/gen-app-icons.mjs`, which writes them into `static/img` as well as
    // into the app — one mark, two properties. `favicon` takes a single path, so
    // the SVG that modern browsers prefer has to be its own tag; those that don't
    // understand it fall back to the `.ico`.
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${baseUrl}img/favicon.svg`,
      },
    },
    // Deploy-only, both of them (see `isDev`).
    //
    // The app redirect would send `localhost:3000/` to the DEPLOYED app, which is
    // the one place a docs author does not want to end up — you started the docs
    // to look at the docs. And the locale redirect would bounce a Czech browser to
    // `/cs/…`, which the dev server does not serve at all: `docusaurus start`
    // builds a single locale, so the other one is a 404 rather than a translation.
    // Dropping both leaves local dev where it belongs — on the English site, at
    // the page you asked for.
    ...(isDev
      ? []
      : [
          {
            tagName: 'script',
            attributes: {},
            innerHTML: appRedirectScript,
          },
          {
            tagName: 'script',
            attributes: {},
            innerHTML: localeRedirectScript,
          },
        ]),
  ],

  // Where the Angular app is, for the landing page and `<AppLink>` in .mdx (the
  // navbar/footer read `appLink` directly). One source, so a domain or base-path
  // move is the DOCS_URL/APP_LINK envs in the deploy workflow and nothing else.
  // `goatcounterUrl` rides along for the same reason: the client module needs it
  // at runtime, and this is how a build-time env reaches the browser.
  customFields: { appLink, goatcounterUrl },

  clientModules: ['./src/clientModules/stats.ts'],

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
      // The bold cut of the mark, not `icons/icon.svg`: the navbar renders the
      // logo at 2rem, where the full mark's six 1.5px rows smudge into a haze —
      // the same reason that cut exists for the 16px tab strip. One file, both
      // jobs; `tools/gen-app-icons.mjs` in the app emits it.
      logo: {
        alt: 'Achordeon',
        src: 'img/favicon.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: appLink,
          label: 'Launch App',
          position: 'right',
        },
        // Deploy-only as well, and for a sharper reason than tidiness: in dev the
        // switch cannot work and does not fail quietly. `docusaurus start` serves
        // one locale, and with `--locale cs` it serves it at the localized base
        // path (`/cs/`) while the router's paths stay relative to that base — so
        // Docusaurus builds the English URL as `"/" + "/docs/…"`, and the browser
        // reads `//docs/…` as protocol-relative and goes looking for a host called
        // `docs`. Locally, switching language means restarting:
        // `pnpm nx start docs -- --locale cs`.
        ...(isDev
          ? []
          : [{ type: 'localeDropdown', position: 'right' } as const]),
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
            { label: 'Privacy', to: '/docs/privacy' },
            { label: 'Account data', to: '/docs/account-data' },
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
