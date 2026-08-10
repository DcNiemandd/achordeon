import fs from 'node:fs/promises';
import path from 'node:path';

import type * as Preset from '@docusaurus/preset-classic';
import type { Config, Plugin } from '@docusaurus/types';
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

/**
 * The IndexNow key — how Bing, Seznam and Yandex are told a page changed instead
 * of waiting to be crawled into finding out. Google ignores the protocol.
 *
 * Deliberately a repo **variable** and not a secret: the whole mechanism is that
 * the key is readable at `https://<host>/<key>.txt`, which is what proves the
 * pinger owns the host. Hiding it would be theatre, and a secret that has to be
 * published is a secret nobody can rotate confidently.
 *
 * Unset means the feature is off, the way `GOATCOUNTER_URL` is: no key file, and
 * `tools/ping-indexnow.mjs` exits without sending. That matters for forks, which
 * would otherwise submit somebody else's host with a key they cannot serve.
 */
const indexNowKey = process.env.INDEXNOW_KEY || '';
if (indexNowKey && !/^[A-Za-z0-9-]{8,128}$/.test(indexNowKey)) {
  // Loud here rather than a 403 from an API nobody is watching: the key file and
  // the ping are the only two places this value is used, and they are both
  // fire-and-forget.
  throw new Error(
    'INDEXNOW_KEY must be 8-128 characters of A-Z, a-z, 0-9 or "-".',
  );
}

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
 * First visit, no locale in the URL: send a Czech browser to the Czech site.
 *
 * **It only ever bounces off the default locale**, and that guard is the whole
 * subtlety. A URL that already names a locale is somebody's deliberate choice —
 * a shared link, the locale dropdown, a search result — and bouncing off it
 * overrides a decision that was already made.
 *
 * Googlebot is the case that made this a bug rather than a rudeness. It renders
 * with `navigator.language` of en-US and a fresh profile every time, so `FLAG`
 * never stops it: every Czech page redirected itself to its English twin under
 * the crawler, and Search Console duly filed the whole `/cs/` tree as "page with
 * redirect" — indexed nowhere. The Czech pages are reachable in their own right
 * now, and `hreflang` (emitted on every page) is what tells Google the two are
 * translations of each other.
 */
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
    if (current !== DEFAULT) return;
    var nav = (navigator.language || DEFAULT).slice(0, 2).toLowerCase();
    var target = SUPPORTED.indexOf(nav) >= 0 ? nav : DEFAULT;
    if (target === current) return;
    var tail = path.slice(BASE.length + (current === DEFAULT ? 0 : current.length + 1));
    var dest = BASE + (target === DEFAULT ? '' : target + '/') + tail + location.search + location.hash;
    location.replace(dest);
  } catch (e) {}
})();`;

/**
 * The workspace libraries, importable from the docs site.
 *
 * `<SongPreview>` renders a real song with the app's own parser and renderer —
 * the docs draw the picture the reader will get instead of describing it. Those
 * two libraries are framework-free by design (PRD-RENDERING §1), so the only
 * thing standing between them and a Docusaurus bundle is module resolution: they
 * are TypeScript sources under `libs/`, reached in the app through
 * `tsconfig.base.json` paths, which webpack knows nothing about. Aliasing them
 * here is that same map, spelled for the bundler. (`apps/docs/tsconfig.json`
 * carries the third copy, for the IDE and `typecheck`.)
 *
 * Docusaurus transpiles any `.ts` outside `node_modules`, so no loader rule is
 * needed — the libs compile with the site's own JS pipeline.
 */
/**
 * Writes `robots.txt` at the site root.
 *
 * Not a file in `static/`, because the one line that matters — where the
 * sitemaps are — has to name an absolute URL, and this site's URL is an env var
 * (`DOCS_URL`). A checked-in robots.txt would either hardcode `achordeon.eu` and
 * lie the moment the site moves, or omit the sitemaps and do nothing.
 *
 * Both locales get a line: the sitemap plugin emits one file per locale, and a
 * crawler that only ever finds the English one has no path to the Czech pages
 * except by guessing.
 */
function robotsTxt(): Plugin {
  return {
    name: 'achordeon-robots-txt',
    async postBuild({ outDir }) {
      const sitemapUrls = i18n.locales.map((locale) => {
        const prefix = locale === i18n.defaultLocale ? '' : `${locale}/`;
        return new URL(`${baseUrl}${prefix}sitemap.xml`, url).href;
      });
      const sitemapIndexUrl = new URL(`${baseUrl}sitemap-index.xml`, url).href;

      // The index first, then the files it points at. Every engine reads
      // `robots.txt`, and this is the discovery path that needs nobody to submit
      // anything by hand — the one that keeps working when a search console has
      // a bad record stuck against a URL.
      await fs.writeFile(
        path.join(outDir, 'robots.txt'),
        [
          'User-agent: *',
          'Allow: /',
          '',
          ...[sitemapIndexUrl, ...sitemapUrls].map(
            (href) => `Sitemap: ${href}`,
          ),
          '',
        ].join('\n'),
        'utf8',
      );

      // One address for every language, beside the per-locale files.
      //
      // The sitemap plugin emits a sitemap per locale and nothing tying them
      // together, so a search console has to be told about each one by hand and
      // will have to be told again for every locale added after this. An index
      // is a single submission that keeps working.
      const entries = sitemapUrls
        .map((href) => `  <sitemap><loc>${href}</loc></sitemap>`)
        .join('\n');
      await fs.writeFile(
        path.join(outDir, 'sitemap-index.xml'),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          entries,
          '</sitemapindex>',
          '',
        ].join('\n'),
        'utf8',
      );

      // The IndexNow ownership proof: a file at the site root whose name is the
      // key and whose only content is the key again. `tools/ping-indexnow.mjs`
      // names it as `keyLocation`, and the receiving engine fetches it to check
      // that whoever is submitting URLs for this host can also publish at it.
      // No key configured, no file — and the pinger stays quiet to match.
      if (indexNowKey) {
        await fs.writeFile(
          path.join(outDir, `${indexNowKey}.txt`),
          indexNowKey,
          'utf8',
        );
      }
    },
  };
}

function achordeonLibs(): Plugin {
  return {
    name: 'achordeon-libs',
    configureWebpack() {
      const lib = (name: string) =>
        path.resolve(__dirname, '../../libs/shared', name, 'src/index.ts');
      return {
        resolve: {
          alias: {
            // `$` = exact match: the libs are barrels, and a deep import into
            // one would be a boundary violation the app's lint already forbids.
            '@achordeon/shared/domain$': lib('domain'),
            '@achordeon/shared/render-core$': lib('render-core'),
            '@achordeon/shared/chord-theory$': lib('chord-theory'),
            '@achordeon/shared/editor-core$': lib('editor-core'),
          },
        },
      };
    },
  };
}

const config: Config = {
  title: 'Achordeon',
  tagline: 'Write, arrange and perform your songs — chords and all.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url,
  baseUrl,

  headTags: [
    // Proves this domain is ours to Seznam Webmaster (reporter.seznam.cz/wm),
    // the way the `google-site-verification` TXT record does for Search Console.
    // Seznam is its own engine with its own crawler, and Google's verification
    // means nothing to it — which matters here, because the `/cs/` half of this
    // site is written for the audience that searches on it.
    //
    // Hardcoded rather than an env var, unlike the deploy-target values above:
    // the token belongs to the domain, not to where the build is going, and it
    // is public by design — it only ever asserts ownership to whoever already
    // holds the account.
    {
      tagName: 'meta',
      attributes: {
        name: 'seznam-wmt',
        content: 'DGyYyzAwrYcno6KWdns7e4s4lF8CiYE3',
      },
    },
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
    // Deploy-only (see `isDev`): the locale redirect would bounce a Czech browser
    // to `/cs/…`, which the dev server does not serve at all — `docusaurus start`
    // builds a single locale, so the other one is a 404 rather than a translation.
    // Dropping it leaves local dev on the English site, at the page you asked for.
    ...(isDev
      ? []
      : [
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
    // Old links only. `/docs` is the intro page itself now (`slug: /` in
    // intro.mdx), because this plugin runs in `postBuild` and nowhere else: a
    // redirect FROM `/docs` left the docs root a 404 under `docusaurus start`,
    // where there is no build to write the redirect file into. A real route is
    // one page in dev, in `serve` and on the deployed site alike.
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [{ from: '/docs/intro', to: '/docs' }],
      },
    ],
    achordeonLibs,
    robotsTxt,
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
    // The link preview: what Google, Slack, Discord and every chat client draw
    // when someone pastes a link to this site. Without it the card is a grey
    // rectangle with a URL in it, which is what a shared link looks like when
    // nobody bothered. `tools/gen-brand-images.mjs` draws it; site-relative,
    // because Docusaurus makes `og:image` absolute against `url` itself.
    image: 'img/social-card.png',
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
            { label: 'Docs', to: '/docs' },
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
