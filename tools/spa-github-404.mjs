// SPA fallback for the app hosted under a subpath on GitHub Pages.
//
// GitHub Pages serves the *root* 404.html for every path it cannot find — there
// is no per-directory 404 — so a reload of an Angular deep link like
// `/achordeon/app/songs` lands on the Docusaurus 404 instead of the app. This
// injects a tiny redirect into that root 404 page: an app path is bounced to the
// app's index with the route encoded in the query (`/achordeon/app/?/songs`),
// which `apps/app/src/index.html` restores before the router runs. Any other
// miss falls straight through and still renders the Docusaurus 404 below.
//
// The app is localised (apps/app/project.json §i18n): the source locale `en`
// builds to the app root and each other locale to its own subfolder (`cs/`), so
// a `cs` deep link must be bounced to the `cs` index — not the `en` one — or it
// reloads in the wrong bundle. The redirect peels a known locale segment first
// and keeps it as the base. Pass those non-root locale subpaths as the third
// argument (comma-separated); keep it in step with the i18n config.
//
// Usage: node tools/spa-github-404.mjs <404.html> <app-base-href> [locales]
//   e.g. node tools/spa-github-404.mjs dist/site/404.html /achordeon/app/ cs

import { readFileSync, writeFileSync } from 'node:fs';

const [file, base, localesArg] = process.argv.slice(2);
if (!file || !base) {
  console.error(
    'Usage: spa-github-404.mjs <404.html> <app-base-href> [locales]',
  );
  process.exit(1);
}

const locales = (localesArg ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MARKER = 'data-spa-fallback';
const html = readFileSync(file, 'utf8');
if (html.includes(MARKER)) {
  console.log(`spa-github-404: already injected in ${file}`);
  process.exit(0);
}

// A locale-adjusted base always ends with a slash, so `pathname === base` is a
// locale home (index.html exists there) and is left alone; only a deeper path is
// a miss to rewrite. `&` in a path segment is escaped so it survives the
// round-trip; `apps/app/src/index.html` reverses it before the router runs.
const redirect =
  `<script ${MARKER}>(function(){` +
  `var app=${JSON.stringify(base)},locs=${JSON.stringify(locales)},` +
  `l=window.location,p=l.pathname;` +
  `if(p.indexOf(app)!==0)return;` +
  `var seg=p.slice(app.length).split('/')[0],` +
  `base=locs.indexOf(seg)>=0?app+seg+'/':app;` +
  `if(p===base)return;` +
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
