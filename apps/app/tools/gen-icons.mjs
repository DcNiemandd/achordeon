// Icon set codegen — Epic 13
// Spec: PRD-UI-SHELL.md §9 (self-hosted inline SVG)
//
// Reads the whitelisted Lucide icons out of `lucide-static` and emits a TS map
// of their inner markup, which `<app-icon>` inlines. Only the icons listed here
// ship — the other ~1975 never enter the bundle.
//
// We take the icons, not `lucide-angular`: that wrapper peers
// `@angular/core: 13.x - 21.x` and would cap the workspace at Angular 21,
// becoming a second upgrade gate beside `@ngrx/signals`. `lucide-static` has no
// peers, so it can never gate an Angular major.
//
// Output is committed, not built on every run: the set changes about never.
// Regenerate with `node tools/gen-icons.mjs` from `apps/app` after editing ICONS.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const workspaceRoot = resolve(projectRoot, '../..');
const iconDir = resolve(workspaceRoot, 'node_modules/lucide-static/icons');

/**
 * Our name -> Lucide's name. The indirection is the point: swapping icon sets
 * later edits this map, not every template.
 */
const ICONS = {
  // nav modules (the rail, and the mobile switcher's composite glyph)
  songs: 'music',
  songbooks: 'library-big',
  stage: 'mic-vocal',
  audience: 'users',
  settings: 'settings',
  // shell chrome
  menu: 'menu',
  more: 'ellipsis',
  close: 'x',
  help: 'circle-help',
  search: 'search',
  // module + editor actions
  add: 'plus',
  plus: 'plus',
  minus: 'minus',
  download: 'download',
  // The full circular arrow, which is what an undo arrow is in most people's
  // heads. It used to be `undo-2`/`redo-2` — an arrow that runs left and loops
  // back — which reads as "go left" before it reads as "go back".
  undo: 'rotate-ccw',
  redo: 'rotate-cw',
  // Transpose is a musical act, so it gets a musical mark: a note, badged with
  // the direction it moves. Bare arrows said "move something" and left which
  // something to the tooltip. The two halves are composed in the template (see
  // the editor page), not merged into one glyph, so the badge can be positioned
  // and coloured independently.
  // `music-4` is two beamed notes, which is a lot of ink under a badge. A single
  // flagged note reads as "a note" at 18px and leaves room for the arrow.
  note: 'music-2',
  transposeUp: 'arrow-up',
  transposeDown: 'arrow-down',
  favorite: 'star',
  title: 'type',
  // An eraser, NOT a circular arrow — undo took that shape, and two controls in
  // the same app pointing the same way meaning different things is worse than
  // either icon being slightly off. It is the more honest mark anyway: reset
  // DELETES this scope's override so the cascade reaches through again
  // (ADR-0006), which is rubbing something out rather than winding it back.
  reset: 'eraser',
  // editor insert bar (Epic 5). Each button pairs one of these with the syntax
  // it writes, so the mark carries the meaning and the glyph underneath keeps
  // the markup learnable.
  brackets: 'brackets',
  heading1: 'heading-1',
  heading2: 'heading-2',
  tag: 'tag',
  pilcrow: 'pilcrow',
  backslash: 'slash',
  // song explorer (Epic 5)
  // `edit` opens the editor, `rename` retitles the library label — two different
  // jobs on the same row, so they must not look alike.
  edit: 'file-pen',
  rename: 'text-cursor-input',
  duplicate: 'copy',
  delete: 'trash-2',
  sortAsc: 'arrow-up-narrow-wide',
  sortDesc: 'arrow-down-narrow-wide',
  warning: 'triangle-alert',
  // songbook entry reordering AND adding (Epic 6). One family for both, because
  // both answer the same question — *where in the list* — and a user who has
  // learnt "arrow into a line = the end" should not learn it twice.
  //
  // Chevrons for one step, not the transpose arrows: those are spoken for by a
  // musical act. An arrow meeting a LINE for the ends, not a double chevron:
  // the line is the end of the list, which is the thing being pointed at; two
  // chevrons only say "more of the same direction".
  moveUp: 'chevron-up',
  moveDown: 'chevron-down',
  moveStart: 'arrow-up-to-line',
  moveEnd: 'arrow-down-to-line',
  // The crossing itself: right is into the songbook, left is back out of it.
  // The Add buttons carry one of these with the position mark badged onto it,
  // the same composition the editor's transpose buttons use — direction first,
  // then which end of the list.
  transferIn: 'arrow-right',
  transferOut: 'arrow-left',
  // The drag handle (Epic 14). A grip, not a move-cross: the cross says "this
  // whole thing is draggable", which is exactly what we are not saying — the row
  // is a click target, and only this one strip of it starts a drag.
  drag: 'grip-vertical',
};

/** Strip the wrapper <svg> and the license comment; keep the drawing only. */
function innerMarkup(name) {
  const svg = readFileSync(resolve(iconDir, `${name}.svg`), 'utf8');
  const body = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!body) {
    throw new Error(`Could not parse ${name}.svg`);
  }
  return body[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('');
}

const entries = Object.entries(ICONS)
  .map(([our, lucide]) => `  ${our}: '${innerMarkup(lucide)}',`)
  .join('\n');

const out = `// GENERATED by tools/gen-icons.mjs — do not edit by hand.
// Lucide (ISC) via lucide-static. Regenerate: node tools/gen-icons.mjs

/** Inner SVG markup per icon, drawn on a 24x24 viewBox with currentColor. */
export const ICON_SET = {
${entries}
} as const;

export type IconName = keyof typeof ICON_SET;
`;

const outDir = resolve(projectRoot, 'src/app/primitives/icon');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon-set.generated.ts'), out);
console.log(`Wrote ${Object.keys(ICONS).length} icons.`);
