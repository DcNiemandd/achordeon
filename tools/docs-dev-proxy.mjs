#!/usr/bin/env node
// One address for a docs site that is two dev servers.
//
// `docusaurus start` serves exactly ONE locale per process, so seeing English
// and Czech at the same time means running it twice. Two ports would mean two
// bookmarks and, worse, a site whose own links lie: the Czech pages are built
// for the base path `/cs/`, and every link between the languages assumes they
// live under one origin. So the two servers move to private ports and this
// stands in front of them on the port everybody already types, routing by the
// only thing that distinguishes the locales - the first path segment.
//
// **HTTP only, on purpose.** Both dev servers hot-reload over a websocket at
// `/ws`, the same path on both, which is exactly the one thing a path-based
// proxy cannot tell apart: whichever way it guessed, half the edits would
// reload the wrong site. Instead each server tells its own client to connect
// straight back to it (`DOCS_DEV_WS_PORT`, see `docusaurus.config.ts`), the
// upgrade never reaches this process, and hot reload works in both languages.
//
// Usage: node tools/docs-dev-proxy.mjs

import http from 'node:http';

const port = Number(process.env.DOCS_DEV_PORT || 3000);

// `localhost`, not `127.0.0.1`: webpack-dev-server binds whatever the name
// resolves to, which on Windows is the IPv6 loopback first. Node 20+ tries both
// families for a name, and only for a name.
const host = 'localhost';

const locales = [
  { prefix: '/cs', port: Number(process.env.DOCS_DEV_PORT_CS || 3011) },
];
const fallback = {
  prefix: '',
  port: Number(process.env.DOCS_DEV_PORT_EN || 3010),
};

const upstreamFor = (url) => {
  const path = url.split(/[?#]/)[0];
  return (
    locales.find((l) => path === l.prefix || path.startsWith(`${l.prefix}/`)) ??
    fallback
  );
};

// The dev servers take a while to compile, and Nx starts this the moment they
// are spawned. A refresh beats an error page nobody can act on.
const waiting = (upstream) => `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="2">
<title>Starting…</title>
<body style="font: 16px/1.5 system-ui; margin: 4rem auto; max-width: 30rem">
<p>Waiting for the docs dev server on port ${upstream.port} — this page refreshes itself.</p>
</body>`;

const server = http.createServer((req, res) => {
  const upstream = upstreamFor(req.url);
  const proxied = http.request(
    {
      host,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  proxied.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(503, {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '2',
    });
    res.end(waiting(upstream));
  });
  req.pipe(proxied);
});

server.listen(port, () => {
  console.log(
    `Docs dev site: http://localhost:${port}/ (en), http://localhost:${port}/cs/ (cs)`,
  );
});
