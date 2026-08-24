# High priority — what is left

Raised 2026-08-23 on `feat/tutorials`, worked through on 2026-08-24. Everything
that was on this list has been implemented, in these commits:

| Commit    | What                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| `8c75e8f` | §2 analytics — route-shape stripping, `all-songs` kept, `skipgc` in both harnesses |
| `b5cb90d` | §1 both bugs — the audience desktop bar, and the 404's link-preview metadata       |
| `39d6cb6` | §3 corrections — two comments, "automatic sync", the Czech stub order              |
| `17a5b8f` | §5 export & import, songbooks                                                      |
| `19e7ba4` | §5 settings — rendering behaviour, the font library, writing `[H]`                 |
| `a09849d` | §5 account, account data, editing, the audience list, the update prompts           |

What follows is what came OUT of that work and is still open.

## 1. Two different orders both call themselves the All songs order

`songbooks.presenter.ts:568` reads `PrintOptionsStore.options().songOrder` —
device-local, and it is the order the book is **printed** in. `stage.presenter.ts:99`
reads `SettingsStore.allSongsOrder` — on the account row, and it is the order the
book is **performed** in. They are independent, and both dialogs mount the same
`app-all-songs-order-dialog`, whose note reads _Saved to your account, so it
applies on every device you sign in on_ — true in Stage, false in Songbooks.

Set the order in Songbooks, then perform, and you get a different order with
nothing on screen to say why. The docs now describe both truthfully
(`songbooks/index.mdx`), but the app is what wants deciding: one order or two,
and if two then two names.

## 2. The Google Fonts index is not precached, so offline search is not guaranteed

`apps/app/public/fonts/google-index.json` ships with the app and `FontFetcher`
reads it once per session, so no request reaches Google. But
`apps/app/ngsw-config.json` precaches only `/fonts/RobotoMono-*.ttf` and
`/fonts/*.txt`, so the service worker never takes a copy of the index and a cold
offline boot may find no catalogue to search.

Either add `/fonts/*.json` to the `app-shell` group — one line, and then the
claim is true — or leave it. `settings.mdx` currently claims only that the index
ships with the app and asks nothing of Google, which is true either way.

## 3. Known test failure, not caused by any of this work

`stage.spec.ts:255` fails in the full suite and passes on its own. Pre-existing;
recorded here so it is not rediscovered as a regression.

## 4. Czech tutorials are still heading-only stubs

Most of them: frontmatter, H1, a one-line lede and the `## N.` headings, with no
translated body. Fully translated: `build-a-songbook.mdx` and
`write-your-first-song.mdx`. The step order of every stub now matches its
English page — `fit-a-song-on-one-page.mdx` was the one that had drifted, and it
was fixed in `39d6cb6`. The Czech REFERENCE pages are complete and were kept in
step with every addition above.
