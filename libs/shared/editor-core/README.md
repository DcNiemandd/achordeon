# shared-editor-core

The Achordeon language, as an editor sees it: the CodeMirror stream grammar
(ADR-0010) and the `HighlightStyle` that colours its tokens.

Framework-free — CodeMirror and `shared/domain` only. The Angular editor
(`apps/app/.../song-editor.ts`) and the docs site's live syntax examples both
mount it, which is the whole reason it is a library: two editors colouring the
same language by two different sets of rules would be two answers to a question
that has one.

The style names colours as custom properties (`--brand`, `--text`, `--text-muted`,
`--text-faint`) rather than literals, so each host supplies its own palette. See
`highlight-style.ts`.

## Running unit tests

Run `nx test shared-editor-core` to execute the unit tests via [Jest](https://jestjs.io).
