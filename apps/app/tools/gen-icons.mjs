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
  // Look at a song without opening it for edit: a sheet with a magnifier over it.
  // The songbook builder hangs it on every row so you can read a song's render in
  // a dialog before deciding to go in and change it. A magnifier ALONE is search
  // (see `search`); the sheet is what says "look at this page", not "find a page".
  preview: 'file-search',
  // The preview's zoom, as a magnifier with a sign. The whole-book viewer scales
  // by column count, so zoom-in shows fewer, larger pages and zoom-out more,
  // smaller ones — the magnifier is what makes that read as scale, not paging.
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  // The two directions a file travels (Epic 7). One tray with the arrow going
  // down, one with it going up — the same glyph mirrored, because they are the
  // same act mirrored: something leaves the library, something arrives.
  //
  // `download` covers BOTH kinds of leaving now: the picture for a player and
  // the Achordeon file for another machine are one button and one dialog, so
  // there is no second act left for an `export` mark to name. The file glyphs
  // (`file-output`/`file-input`) said "a page moves", which was a distinction
  // without a button once the two merged — and a page with an arrow reads as
  // "print" at 18px anyway.
  download: 'download',
  import: 'upload',
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
  // Both directions at once, for the places that name the *act* rather than one
  // step of it: the performing menus, where one row opens a stepper that goes
  // either way. Badged onto the same note as the two above, so it reads as the
  // same feature seen from further back.
  transposeBoth: 'arrow-up-down',
  favorite: 'star',
  // The favourites-first flag in the explorer toolbar, which is NOT the same act
  // as favouriting a song: the row's `favorite` star sets the flag on one song,
  // this one says "float the ones already flagged to the top". A bare star for
  // both would put the same mark on a per-row toggle and a whole-list sort, so
  // this one carries the tick — the star, plus a statement about it.
  starCheck: 'star-check',
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
  // Markdown emphasis: the two marks everyone knows from every rich-text
  // toolbar, so the button teaches nothing new — B is bold, I is italic.
  bold: 'bold',
  italic: 'italic',
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
  // Read-only summary list (Epic 9) and the paging chevrons.
  list: 'list',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  // Performing / audience fullscreen (Epic 8/9): the four-corner expand, and its
  // inward-pointing exit.
  fullscreen: 'maximize',
  fullscreenExit: 'minimize',
  // The dark page, on Stage and in the Audience. A moon, not a contrast disc or
  // a lightbulb: what the toggle is really about is the room you are playing in
  // after dark, and the moon is the only one of the three that says so without
  // a label. Deliberately NOT paired with a `sun` — the control is a checkbox
  // that stays put and lights up, not a two-state swap like fullscreen, so a
  // second glyph would only make the row change shape under the thumb.
  moon: 'moon',
  // Turn the page (ADR-0013), on Stage and in the Audience. The act is physical
  // — you are being asked to hold the device the other way round — so the glyph
  // is the device, badged with the direction to turn it, the way Transpose above
  // badges its note with the direction the music moves.
  //
  // A phone rather than a `monitor`: the control is hidden wherever a screen
  // cannot be turned, so the only reader who ever sees it is holding one.
  //
  // Two arrows, unlike the moon above, because this one IS a two-state swap:
  // counter-clockwise offers the turn, clockwise offers to put it back. A single
  // arrow on a pressed control would be pointing the way you have already gone.
  smartphone: 'smartphone',
  rotateCcw: 'rotate-ccw',
  rotateCw: 'rotate-cw',
  // Copy to the clipboard — the Audience link. A CLIPBOARD with an arrow, not
  // the two stacked sheets `duplicate` above uses: those sheets say "make
  // another one of these", which is what the explorer row means and is not what
  // happens here. Same word, two acts; two glyphs.
  copy: 'clipboard-copy',
  // The tick that answers it. The clipboard gives no feedback of its own, and a
  // tooltip flipping to "Copied" is not feedback on a touch screen, where
  // nothing was hovering to read it.
  check: 'check',
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
