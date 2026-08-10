# Promotion

Where `achordeon.eu` is registered, what each engine was given, and what is left
to do. Not published — this lives beside the PRDs, not on the docs site.

Started 2026-08-10. Update the dates when something changes; a checklist nobody
maintains is worse than none.

## Search engines

| Engine | Console                                                    | Verified by                                                     | Status                 |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| Google | [Search Console](https://search.google.com/search-console) | DNS `TXT google-site-verification=VKmdi…` (domain property)     | Verified               |
| Seznam | [reporter.seznam.cz/wm](https://reporter.seznam.cz/wm)     | `<meta name="seznam-wmt">` in `docusaurus.config.ts` `headTags` | Verified 2026-08-10    |
| Bing   | [bing.com/webmasters](https://www.bing.com/webmasters)     | Import from Google Search Console                               | **Not registered yet** |

A **domain property** in Google covers every variant at once — `http`, `https`,
apex and `www`. One property is enough; do not add URL-prefix ones beside it.

Google verification means nothing to Seznam or Bing. Each engine is its own
registration, and Seznam matters most for the `/cs/` half of the site — it holds
roughly 15–20% of Czech search.

Seznam Webmaster is a reporting tool, not a submission one: crawler visits,
how many pages made it into the index, redirects and errors, plus an API. There
is no sitemap upload and no "reindex this" button. It finds the sitemaps through
`robots.txt`, which names all three, and hears about changes through IndexNow.

### Submitted to Google

- `https://achordeon.eu/cs/sitemap.xml` — Úspěšné, 16 URLs.
- `https://achordeon.eu/sitemap-index.xml` — index processed, but see below.
- `https://achordeon.eu/sitemap.xml` — **"Nelze načíst" since 2026-07-28.**
  Type shows "Neznámé" with no read date, meaning Google has never fetched it
  even once. The file is provably fine: 200, `application/xml`, no BOM, valid
  XML, 16 `<loc>`, identical on all four IPv4 and all four IPv6 origins, and
  fine under Googlebot's own user agent. It is a dead record on Google's side,
  and because GSC keys sitemaps by URL, the index's reference to it resolves to
  that same dead record instead of a fresh fetch. Next thing to try: delete the
  standalone entry so the index is the only claim on the URL. After that, the
  fallback is emitting the English sitemap under a different filename so it gets
  an address GSC has no history against.

## Automated: IndexNow

One POST to the shared endpoint announces changed URLs to every participating
engine — **Bing, Seznam.cz, Yandex, Naver, Yep and Amazon** — because a
submission to any one of them is distributed to all. Google does not
participate at all; the sitemaps stay the only thing that reaches it.

- Key file: written at the site root by the `robotsTxt` plugin in
  `apps/docs/docusaurus.config.ts`, named and filled with `INDEXNOW_KEY`.
- Ping: `tools/ping-indexnow.mjs`, run by `.github/workflows/deploy.yml` **after**
  the deploy step, reading its URL list out of the sitemaps just built.
- `INDEXNOW_KEY` is a repo **variable**, not a secret — the mechanism is that the
  key is readable at `/<key>.txt`. Unset means no key file and no ping, so forks
  submit nothing.

`INDEXNOW_KEY` is set and the pipeline is live. Every push announces itself from
here on, with no console to visit.

The response code is the health check, and it is worth knowing which is which:
`202` means received with key validation still pending, `200` means the key file
was fetched and accepted. The first deploy ping returned `202`; the next
submission returned `200`, which is the proof that ownership is established.
`403` would mean the key file is missing or its contents do not match.

The engines still have to know the host exists: a submission for a site Bing or
Seznam has never heard of buys nothing. Register first, then the pings do the
rest.

## What the site itself carries

Everything here is generated, so it cannot drift from the deploy target:

| Thing                                       | Where it comes from                                |
| ------------------------------------------- | -------------------------------------------------- |
| `robots.txt` (sitemap index + both locales) | `robotsTxt` plugin, `docusaurus.config.ts`         |
| `sitemap-index.xml`                         | same plugin                                        |
| `sitemap.xml`, `cs/sitemap.xml`             | Docusaurus sitemap plugin, one per locale          |
| `og:image` link-preview card                | `themeConfig.image` → `tools/gen-brand-images.mjs` |
| Per-page `description`                      | frontmatter on every `.mdx`, English and Czech     |
| `hreflang` en / cs / x-default              | Docusaurus i18n, automatic                         |
| `/favicon.ico` at the root                  | `apps/app/tools/gen-app-icons.mjs`                 |
| README banner + screenshots                 | `tools/gen-brand-images.mjs`                       |

## Fixed along the way

- **Enforce HTTPS was off** (2026-08-10). `http://achordeon.eu/` answered `200`
  with the real page instead of redirecting, which is what Search Console's
  "Používání protokolu HTTPS nebylo vyhodnoceno" was about. Fixed in repo
  Settings ▸ Pages; apex, `www` and deep paths all `301` now.
- **The whole `/cs/` tree was excluded** as "Stránka s přesměrováním". The
  first-visit locale redirect bounced off _any_ page, and a crawler has a fresh
  profile and `navigator.language` of en-US every time, so the once-only flag
  never applied to it: every Czech page redirected itself to its English twin
  under Googlebot. It now only bounces off the default locale. After the deploy,
  press **OVĚŘIT OPRAVU** on that issue in Indexování ▸ Stránky.
- **`/favicon.ico` 404'd.** The mark only existed under `img/`, and Google's
  favicon crawler asks the domain root regardless of `<link rel=icon>`.

All three verified live on 2026-08-10, along with `robots.txt`, the sitemap
index and the IndexNow key file. A crawler asking for `/cs/docs/songbooks` with
`navigator.language` of en-US now stays where it was sent.

## Where it is not promoted yet

Nothing links to `achordeon.eu`. That, not on-page work, is what is keeping it
out of results — and the name is contested by an unrelated ChordPro editor
(`tiamatix/achordeon`), a Behance tag, a SoundCloud track and a classical
composition, all of which currently outrank the site for "achordeon".

Untouched, roughly in order of effort to value:

- [ ] GitHub repo topics and description — _done 2026-08-10_
- [ ] alternativeto.net entry
- [ ] awesome-list PRs (music, self-hosted)
- [ ] r/guitar, r/opensource, r/selfhosted
- [ ] Czech guitar/muzikant forums — the audience the `/cs/` pages were written for
- [ ] Show HN
- [ ] Product Hunt

One real inbound link is worth more than any further technical tuning.

## Routine after a deploy

1. Google: **Kontrola adresy URL** → paste `https://achordeon.eu/` → **POŽÁDAT O
   INDEXOVÁNÍ**. Quota is about a dozen a day; spend it on the homepage and
   `/docs`, not on everything.
2. Google: **Indexování ▸ Stránky** → any open issue → **OVĚŘIT OPRAVU**.
3. Bing and Seznam need nothing — IndexNow already told them.

A sitemap gets pages _discovered_. Only a recrawl updates the title, the summary
and the favicon that a searcher actually sees.
