# 19. Song sites live behind the proxy, and only sites that allow it

Date: 2026-11-10

## Status

Accepted

## Context

Users want to bring a song in from a chord website by typing its name or pasting
its link. Those sites send no CORS headers, so a browser cannot read them, and a
server has to fetch on the user's behalf: a Supabase edge function acting as a
proxy. Until now the stated line was that nothing is ever fetched on our side.
Getting a song in meant the user copying it themselves.

Two questions follow once there is a proxy: where the list of sites lives, and
which sites may be on it.

## Decision

**The edge function alone knows the Song sites.** Each site's name, URLs and
parsing live in one adapter inside the function. The app knows a site only by
a number. It asks the function for display names and link hints, sends whatever
the user typed (a name, an artist or a URL), and receives raw song text, which it
converts itself with the domain function used for paste and file import. The
contract never names a site.

This is not secrecy. A network trace shows the result links. What it buys is that
adding, fixing or dropping a site is a function deploy and never an app release.
Sites break: plnyzpevnik is read through an undocumented Next.js RSC payload, and
fixing it must not wait for users to update.

**A site that refuses automated reading is not a Song site.** The proxy fetches
one song per explicit user action, caches and stores nothing, uses an
identifiable User-Agent, and stays within the site's robots.txt. It never solves
or works around an anti-bot measure. Supermusic is the first case: robots.txt
disallows its search, and song pages sit behind a deliberate proof-of-work JS
challenge. Its songs come in by copy and paste through the editor's Convert bar.
Ultimate Guitar's terms forbid it outright.

## Considered options

- **Fetch from the browser through a generic CORS proxy.** Rejected: there would
  be no place to enforce the bounds above or a rate limit, and the site list would
  ship in the app.
- **Site adapters in the app, with the function as a dumb pass-through.**
  Rejected: every upstream markup change would need an app release, and a dumb
  pass-through is an open proxy.
- **Solve supermusic's challenge in the function.** Rejected: that is getting
  around an access control the site put there on purpose.

## Consequences

- "Search all sites" in v1 searches exactly one site (plnyzpevnik). The response
  is still grouped per site, so a second site adds no new response shape.
- The function, not the app, is where a site that changes its terms or adds
  bot protection gets removed. Removing its adapter is the whole change.
- Supermusic support is a paste feature, and its quality depends on the Convert
  bar's chord-row detection, not on the proxy.
