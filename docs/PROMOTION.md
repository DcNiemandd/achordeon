# Promotion

Where `achordeon.eu` is registered, what each engine was given, and what is left
to do. Not published — this lives beside the PRDs, not on the docs site.

Started 2026-08-10. Update the dates when something changes; a checklist nobody
maintains is worse than none.

## Search engines

| Engine | Console                                                    | Verified by                                                     | Status                                                   |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Google | [Search Console](https://search.google.com/search-console) | DNS `TXT google-site-verification=VKmdi…` (domain property)     | Verified                                                 |
| Seznam | [reporter.seznam.cz/wm](https://reporter.seznam.cz/wm)     | `<meta name="seznam-wmt">` in `docusaurus.config.ts` `headTags` | Verified 2026-08-10                                      |
| Bing   | [bing.com/webmasters](https://www.bing.com/webmasters)     | Import from Google Search Console                               | Registered; sitemaps in. **Nothing indexed** — see below |

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

### Bing — everything is right and nothing is indexed (2026-08-12)

The console is registered and holds the sitemaps, IndexNow validates, and
`site:achordeon.eu` on Bing returns **zero pages**. Audited so the next person
does not re-derive it:

| Check                           | Result                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| `/` fetched as `bingbot/2.0`    | 200, 12.6 KB                                               |
| Content pre-rendered            | Yes — the hero and every feature paragraph are in the HTML |
| `noindex` / `X-Robots-Tag`      | None                                                       |
| Canonical                       | `https://achordeon.eu/`                                    |
| `robots.txt`                    | Allows all, names all three sitemaps                       |
| `sitemap.xml`                   | 200, well-formed, 16 `<loc>`                               |
| `www.` → apex, `http` → `https` | 301 both                                                   |

The pre-rendering row is the one that would not be obvious: **Bing does not run
client-side JavaScript** the way Google does, so an SPA shell would be an empty
page to it. Docusaurus pre-renders, so the docs site passes — but it is why the
Angular app at `/app/` has no business being in a sitemap.

**"IndexNow is not registered" in Bing Webmaster Tools is a UI distinction, not a
failure.** That page tracks a key **generated inside** the console and bound to
the verified property. Ours is self-generated and self-hosted, which the protocol
accepts and that panel does not display. Cosmetic. To light it up, generate a key
in the console and set `INDEXNOW_KEY` to it — the writer and the pinger publish
whatever the variable holds, so neither needs changing.

The key file was checked byte for byte on 2026-08-12: `200`, `text/plain;
charset=utf-8`, `Content-Length: 32` — exactly the key, **no trailing newline and
no BOM**, which is the usual cause of a `403`. And the deploy's own ping settles
it from the other side:

```
ping-indexnow: 32 URLs submitted for achordeon.eu (200).
```

`200`, not `202`, not `403`: the key validated and the submission was accepted.
32 rather than 16 because both locales' sitemaps are read. So IndexNow works end
to end and is **not** what is keeping the site out of Bing.

What is: **nothing links here.** IndexNow only means "this URL exists" — it is not
a request to index and buys no crawl budget. Microsoft's own support threads land
in the same place every time: a new domain with no inbound links gives Bing no
reason to spend a crawl on it, and one real external link is what moves URLs past
"Crawl pending". Which is the conclusion the last section of this file had already
reached on its own.

And URL Inspection confirms it in Bing's own words, on the same day:

> **Discovered but not crawled — URL cannot appear on Bing.**
> Discovered on 10 Aug 2026. "The inspected URL is known to Bing but has some
> issues which are preventing indexation."

Read the two halves separately, because they say opposite things about our setup:

- **Discovered on 10 Aug 2026** — the day the console was registered and the pings
  began. So discovery **worked**: the sitemaps and IndexNow did exactly their job,
  and Bing has held the URL ever since.
- **Not crawled** — Bing has never fetched the page. Not once. Every technical
  check above passes because none of them has ever been exercised.

"Has some issues" is boilerplate for this state rather than a specific defect —
Bing does not name one, and the audit above is what rules the usual suspects out.
Among the documented causes of discovered-but-not-crawled, the only one that fits
a site scoring 200 on every check is **a URL with few or no internal and external
links**: the crawl is not blocked, it is unscheduled, because nothing has given
Bing a reason to spend the budget. Which is the same answer arrived at three ways
now.

Two levers, and only one of them is ours:

- **"Request indexing"** on the inspection page. Bing offers it precisely for this
  state, and it costs one click — take it for `/` and `/docs`, and mind that the
  daily quota is small.
- **A real inbound link.** Everything else on this page is hygiene; this is the
  lever. See the section below, which had already worked it out.

Still worth confirming while in there: that the property is the **apex**
`https://achordeon.eu`, since the IndexNow payload submits host `achordeon.eu` and
a `www` or `http` property would not line up with it.

**Inspect the URL without a trailing slash.** `/docs/` came back "Not discovered —
the inspected URL is not known to Bing", which is correct and means nothing is
wrong: the site is built `trailingSlash: false` (`docusaurus.config.ts`), the
sitemap lists `https://achordeon.eu/docs`, and `/docs/` is a hard 404 that was
never submitted to anybody. `/docs` answers 200 and canonicalises to itself. The
same care applies to the Request-indexing clicks, which would otherwise be spent
on a 404.

Inspected properly, `/docs` reports the **same state as the homepage** — known,
never crawled. Two pages in the same state is worth more than one: it rules out a
per-URL fault and confirms the hold is **host-wide**, which is what an unscheduled
crawl looks like and not what a page-level problem looks like.

`/cs` caught the same trap pointing the other way, so here is the rule: **inspect
exactly the form the sitemap lists.** Under `trailingSlash: false` a locale root
keeps its slash and a page does not.

| Form                       | What it is                                    |
| -------------------------- | --------------------------------------------- |
| `https://achordeon.eu/`    | English root, **with** slash — in the sitemap |
| `https://achordeon.eu/cs/` | Czech root, **with** slash — in the sitemap   |
| `/docs`, `/cs/docs`, …     | Pages, **no** slash — in the sitemap          |
| `/docs/`                   | Hard **404**. Never submitted, not a page     |
| `/cs`                      | **301** to `/cs/`. Never submitted either     |

The two wrong forms fail differently, and only one is a visitor-facing papercut:
`/cs` redirects and costs nothing, while **a typed or pasted `/docs/` is a 404**,
and trailing slashes get added by habit and by other sites' link parsers. It is a
real 404 rather than a soft one, so it costs nothing in search — only the reader
who bounces. GitHub Pages cannot redirect server-side; the alternative is
`trailingSlash: undefined`, which emits both forms. Not urgent, and not obviously
worth the churn.

One latent flaw found while checking, not currently doing harm: the deploy
**resubmits all 32 URLs on every push**, changed or not, because the pinger reads
its list out of the sitemaps rather than out of a diff. The IndexNow FAQ asks for
submissions only when content changed and answers `429` past an undisclosed
threshold. No `429` has been seen, so this is a risk rather than a fault.

**Half of that is fixed** (`e3dcd05`). The step is still `continue-on-error: true`
— an announcement should not fail a deploy — but a refusal is no longer silence:
`ping-indexnow.mjs` prints a `::error::` annotation naming what a `403` or a `429`
means and sets a non-zero exit code, so a rejected submission is visible in the
run instead of scrolling past as a number nobody reads. **Still open: the diff.**
The pinger has no memory of the previous deploy, so it cannot yet submit only what
changed.

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
| `<lastmod>` on every URL                    | `sitemap: { lastmod: 'date' }` + the git edit time |
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

- [x] GitHub repo topics and description — _done 2026-08-10_
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
