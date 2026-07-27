// SPA fallback for the app hosted under a subpath on GitHub Pages.
//
// GitHub Pages serves the *root* 404.html for every path it cannot find — there
// is no per-directory 404 — so a reload of an Angular deep link like
// `/app/songs` lands on the Docusaurus 404 instead of the app. This
// injects a tiny redirect into that root 404 page: an app path is bounced to the
// app's index with the route encoded in the query (`/app/?/songs`),
// which `apps/app/src/index.html` restores before the router runs. Any other
// miss falls straight through and still renders the Docusaurus 404 below.
//
// The app is localised at *runtime* (PRD-INFRASTRUCTURE.md §11 — one bundle, the
// translations loaded as data), so there is exactly one app root and no locale
// segment to peel off a path before bouncing it. An earlier version took the
// locale subpaths as a third argument, from when each language was its own build.
//
// Usage: node tools/spa-github-404.mjs <404.html> <app-base-href>
//   e.g. node tools/spa-github-404.mjs dist/site/404.html /app/

import { readFileSync, writeFileSync } from 'node:fs';

const [file, base] = process.argv.slice(2);
if (!file || !base) {
  console.error('Usage: spa-github-404.mjs <404.html> <app-base-href>');
  process.exit(1);
}

const MARKER = 'data-spa-fallback';
const html = readFileSync(file, 'utf8');
if (html.includes(MARKER)) {
  console.log(`spa-github-404: already injected in ${file}`);
  process.exit(0);
}

// The base always ends with a slash, so `pathname === base` is the app home
// (index.html exists there) and is left alone; only a deeper path is a miss to
// rewrite. `&` in a path segment is escaped so it survives the round-trip;
// `apps/app/src/index.html` reverses it before the router runs.
const redirect =
  `<script ${MARKER}>(function(){` +
  `var base=${JSON.stringify(base)},l=window.location,p=l.pathname;` +
  `if(p.indexOf(base)!==0||p===base)return;` +
  `var r=p.slice(base.length);` +
  `l.replace(base+'?/'+r.replace(/&/g,'~and~')+` +
  `(l.search?'&'+l.search.slice(1).replace(/&/g,'~and~'):'')+l.hash);` +
  `})();</script>`;

const head = /<head[^>]*>/i;
if (!head.test(html)) {
  console.error(`spa-github-404: no <head> found in ${file}`);
  process.exit(1);
}

writeFileSync(
  file,
  html.replace(head, (tag) => tag + redirect),
);
console.log(`spa-github-404: injected app fallback (${base}) into ${file}`);
