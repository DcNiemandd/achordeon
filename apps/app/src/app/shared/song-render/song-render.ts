// Song render — Epic 5 ▸ subtask 6
// Spec: PRD-RENDERING §2 (mount a live <svg>), §6 (the render is a document);
// PRD-INFRASTRUCTURE.md §7 (song content is user input)

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

/**
 * Mounts a rendered song into the page.
 *
 * A **controlled component**: it takes an SVG string and shows it. It does not
 * know what a song is, does not parse, and does not lay anything out — the
 * feature's presenter does that through `RenderService`. Stage and Audience mount
 * this same component later; this is why it is in `app/shared`.
 *
 * **Never `innerHTML`, and never `bypassSecurityTrust*`** (PRD-INFRASTRUCTURE.md
 * §7). Song content is user input, and it reaches this string through `emit`. It
 * is parsed with `DOMParser` into a real SVG document and adopted — a parser
 * cannot be tricked into running a `<script>` or an `onload=`, because it builds
 * a document rather than evaluating markup. `emit` escapes its text (it is the
 * one XML writer we own), so this is belt and braces: two independent reasons a
 * song called `<img onerror=…>` is just a title.
 */
@Component({
  selector: 'app-song-render',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="mount" #mount data-testid="song-render"></div>`,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    /* The mounted svg is sized in render(), not here: it is imported into the
       DOM rather than written in this template, so it carries no encapsulation
       attribute and a scoped ".mount > svg" rule would never match it. It matched
       nothing, and the render sat at its intrinsic 264px in the middle of the
       page instead of filling it. */
    .mount {
      block-size: 100%;
    }
  `,
})
export class SongRender {
  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');

  /** A self-contained SVG document, as produced by `RenderService.toSvg`. */
  readonly svg = input.required<string>();

  constructor() {
    effect(() => this.render(this.svg()));
  }

  private render(svg: string): void {
    const host = this.mount().nativeElement;
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = parsed.documentElement;

    // A parse error yields an XML error document rather than an <svg>. Show
    // nothing rather than mounting the browser's error markup into the page.
    if (root.nodeName !== 'svg') {
      host.replaceChildren();
      return;
    }

    const svgNode = document.importNode(root, true) as unknown as SVGElement;
    // `emit` writes intrinsic width/height so the SVG is a valid standalone file
    // for export (PRD-RENDERING §2). On screen it is not a file, it is a page:
    // fill the frame and let the viewBox do the scaling.
    svgNode.style.inlineSize = '100%';
    svgNode.style.blockSize = '100%';
    svgNode.style.display = 'block';
    host.replaceChildren(svgNode);
  }
}
