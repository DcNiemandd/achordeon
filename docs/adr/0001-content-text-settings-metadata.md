# 1. Song content lives in text; render settings live in metadata

Date: 2026-06-26

## Status

Accepted

## Context

A Song carries two kinds of information: **content** (lyrics, chords, titles,
subtitles, block labels — what the user types) and **render settings** (scale,
columns, title position, aspect ratio, and the Songbook-scoped chord color/size/
font). The original PRD format put everything into the source text, and the
editing docs flagged this as an unstable, undecided "source of truth": should all
data live in the source text, or should the source stay clean and lyrical while
extra information hides in metadata?

This blocks the export format and the parser, and is expensive to change once
real songs exist in the wild, so it needs a deliberate decision.

### Options

- **A — everything in the source text.** Settings become markup directives in a
  header block. Single source of truth, trivial round-trip, copy-paste-complete,
  diff-friendly — but settings clutter the readable source and GUI controls must
  read/write text directives for config that isn't really "content."
- **B — readable source + settings in metadata.** Text holds only semantic
  content; settings are a structured object edited via GUI panels. Clean
  separation, GUI-friendly — but two things to keep in sync, and plain-text copy
  or an edited downloaded file loses settings.

## Decision

Adopt **Option B**. A Song's text holds only semantic content (lyrics, chords,
`*` title, `**` subtitle, block labels). Render settings live as structured
metadata edited through GUI controls. The JSON export bundles both.

## Consequences

- The editor's existing split — content on the left (with insert-syntax buttons),
  settings in a separate panel — maps 1:1 onto "text + metadata object."
- The source stays readable, addressing the original "unstable format" worry.
- Export/round-trip relies on the metadata travelling with the content: JSON
  carries both; downloaded files embed metadata that is lost if edited (already
  an accepted limitation).
- Plain-text copy of the source carries content only, not settings.
- Settings are never hand-editable in the raw source — only via GUI. If power-user
  text editing of settings is ever wanted, this decision must be revisited.
