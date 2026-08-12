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
//
// **A refusal is not silence.** A 403 or a 429 means the submission was read and
// thrown away, which is the one outcome nothing downstream would ever notice —
// see `REJECTIONS` below for how each is surfaced, and why the rest are not.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** IndexNow caps a single submission at 10 000 URLs. */
const MAX_URLS = 10_000;

/**
 * The two rejections that are ours to fix, and what each one means.
 *
 * Everything else an API can answer with — a 5xx, a timeout, a connection
 * refused — is somebody else having a bad day, and the workflow step is
 * `continue-on-error` precisely so that cannot paint a finished deploy red.
 * These two are the opposite: they say the submission was understood and
 * refused, and nothing will land until someone here does something about it.
 */
const REJECTIONS = {
  403: 'the key file is missing, or its contents do not match the key that was submitted. Check that `<key>.txt` is served at the site root, is exactly the key, and carries no trailing newline and no BOM.',
  429: 'submitting too often. IndexNow asks for a submission only when content actually changed, and this deploy resubmits every URL on every push.',
};

/**
 * Lift a message into the run summary, not just the log body.
 *
 * `::error::` is how GitHub Actions is told something is worth surfacing. It is
 * the only lever left here: the step is `continue-on-error: true` on purpose, so
 * a red step is not available as a signal, and a line in a deploy log is a thing
 * nobody reads until they are already looking for it.
 *
 * Only inside Actions — anywhere else the marker is noise printed at a human.
 */
function annotateError(message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::error::${message}`);
  }
}

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

  // A refusal, and a refusal is silent by default: nothing downstream notices
  // that no engine was told anything. Named out loud, and annotated so it
  // reaches the run summary rather than page four of a log.
  const rejection = REJECTIONS[response.status];
  if (rejection) {
    const message = `ping-indexnow: ${response.status} for ${host} — ${rejection} No URL was accepted.`;
    annotateError(message);
    throw new Error(message);
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
