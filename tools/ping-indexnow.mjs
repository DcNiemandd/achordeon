// Tells Bing, Seznam and Yandex what changed, instead of waiting for a crawl.
//
//   node tools/ping-indexnow.mjs dist/site
//   node tools/ping-indexnow.mjs dist/site --dry-run   # print, send nothing
//
// IndexNow is one POST carrying a list of URLs. The engines that implement it
// share submissions with each other, so one call reaches all of them. Google
// does not participate — nothing here helps there, and nothing here is a
// substitute for the sitemaps.
//
// Run after a deploy, not after a build: submitting a URL that is not live yet
// earns a crawl of the old page, which is worse than not submitting at all.
//
// **Silence is a valid outcome.** With no `INDEXNOW_KEY` the site publishes no
// key file (see `apps/docs/docusaurus.config.ts`), so there is nothing to prove
// ownership with and this exits 0 without sending. A fork must not submit the
// upstream host, and CI must not fail because a variable nobody set is unset.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** IndexNow caps a single submission at 10 000 URLs. */
const MAX_URLS = 10_000;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const isDryRun = process.argv.includes('--dry-run');

const siteDir = resolve(args[0] || 'dist/site');
const key = process.env.INDEXNOW_KEY || '';
const siteUrl = process.env.DOCS_URL || 'https://achordeon.eu';

// The key file is written into the build's root, which is `baseUrl` on the live
// host — not necessarily the origin root. Deployed under a sub-path, a
// `keyLocation` of `/<key>.txt` would point at a 404 and the submission would be
// rejected for want of proof.
const basePath = process.env.DOCS_BASE_URL || '/';

async function main() {
  if (!key) {
    console.log('ping-indexnow: no INDEXNOW_KEY, nothing submitted.');
    return;
  }

  const urls = await collectUrls(siteDir);
  if (urls.length === 0) {
    throw new Error(`ping-indexnow: no <loc> entries found under ${siteDir}`);
  }
  if (urls.length > MAX_URLS) {
    throw new Error(
      `ping-indexnow: ${urls.length} URLs exceeds the ${MAX_URLS} cap for one submission.`,
    );
  }

  const host = new URL(siteUrl).host;
  const body = {
    host,
    key,
    keyLocation: new URL(`${basePath}${key}.txt`, siteUrl).href,
    urlList: urls,
  };

  if (isDryRun) {
    console.log(`ping-indexnow: would submit ${urls.length} URLs for ${host}`);
    console.log(`  keyLocation ${body.keyLocation}`);
    for (const u of urls) console.log(`  ${u}`);
    return;
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  // 200 accepted, 202 accepted with the key still to be validated — both mean
  // the submission landed. Anything else is worth reading out loud.
  if (response.status === 200 || response.status === 202) {
    console.log(
      `ping-indexnow: ${urls.length} URLs submitted for ${host} (${response.status}).`,
    );
    return;
  }
  throw new Error(
    `ping-indexnow: ${response.status} ${response.statusText} — ${(
      await response.text()
    ).slice(0, 300)}`,
  );
}

/**
 * Every URL the site publishes, read out of the sitemaps it just built.
 *
 * The sitemaps are the list of what this site claims exists, so deriving the
 * submission from them means the two can never disagree — and a locale added
 * later is carried along without touching this file.
 */
async function collectUrls(dir) {
  const files = await sitemapFiles(dir);
  const urls = new Set();
  for (const file of files) {
    const xml = await readFile(file, 'utf8');
    // The index only points at other sitemaps, which are read on their own pass.
    if (xml.includes('<sitemapindex')) continue;
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.add(loc.trim());
    }
  }
  return [...urls];
}

/** `sitemap.xml` at the root and one per locale sub-path, without a full walk. */
async function sitemapFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.xml')) {
      found.push(join(dir, entry.name));
    } else if (entry.isDirectory()) {
      // Only the one name, rather than walking: a locale sub-path is the only
      // place the sitemap plugin puts one, and `assets/` is large.
      const nested = join(dir, entry.name, 'sitemap.xml');
      if (await isFile(nested)) found.push(nested);
    }
  }
  return found;
}

async function isFile(file) {
  return stat(file).then(
    (s) => s.isFile(),
    () => false,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
