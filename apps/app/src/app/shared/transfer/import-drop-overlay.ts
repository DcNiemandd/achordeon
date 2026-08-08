// Drop a file anywhere in Achordeon and it imports — plan §7
//
// **Window-level handling is mandatory, not a design choice.** Without a
// `preventDefault` on `dragover`/`drop` at the window, a file dropped outside a
// registered zone makes the browser navigate to it, and the app is replaced by a
// wall of raw JSON. Since that listener has to exist anyway, the whole window is
// the target: a drop in Stage or Settings behaves like a drop in Songs.
//
// An **overlay**, not a zone. The whole window is the target, and a name promising
// edges would invite someone to look for them.
//
// Controlled, like every panel in `app/shared`: it injects nothing and emits the
// files. The window listeners are its own because it is mounted once, at the shell.
//
// It deliberately does not look like the song explorer's `is-drop-target`, which
// paints row reordering. There is no event-level collision — CDK drag-drop uses
// pointer events, not native HTML5 DnD — but two different drops that looked alike
// would be a confusion worth avoiding.

import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../primitives';

@Component({
  selector: 'app-import-drop-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    // `dragover` is what actually decides: a drop only fires where the drag was
    // allowed to land, so this is the line that stops the browser navigating.
    '(window:dragover)': 'onDragOver($event)',
    '(window:dragenter)': 'onDragEnter($event)',
    '(window:dragleave)': 'onDragLeave($event)',
    '(window:drop)': 'onDrop($event)',
  },
  template: `
    @if (isOver()) {
      <div class="overlay" data-testid="import-drop-overlay" aria-hidden="true">
        <div class="card">
          <app-icon name="transferIn" class="mark" />
          <p class="title">{{ title }}</p>
          <p class="hint">{{ hint }}</p>
        </div>
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      /* Nothing here may swallow the drag: the listeners are on the window, and
         an overlay that took pointer events would put a fresh element under the
         cursor mid-drag and fire a spurious dragleave on the way in. */
      pointer-events: none;
      background: color-mix(in srgb, var(--surface) 82%, transparent);
    }

    .card {
      display: grid;
      justify-items: center;
      gap: var(--space-2);
      padding: var(--space-4);
      border: 2px dashed var(--brand);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-2);
      text-align: center;
    }

    .mark {
      --icon-size: 32px;
      color: var(--brand);
    }

    .title {
      margin: 0;
      font-size: var(--text-md);
    }

    .hint {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class ImportDropOverlay {
  /** Files were dropped on the window — the shell hands them to the inbox. */
  readonly dropped = output<File[]>();

  protected readonly isOver = signal(false);

  /**
   * `dragenter`/`dragleave` fire for every element the cursor crosses, so a plain
   * boolean flickers off the moment the drag passes over a button. Counting the
   * pairs is the standard answer, and the count is what `drop` resets.
   */
  private depth = 0;

  protected onDragOver(event: DragEvent): void {
    if (!carriesFiles(event)) return;
    // The one line that stops the browser from navigating to the file.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  protected onDragEnter(event: DragEvent): void {
    if (!carriesFiles(event)) return;
    this.depth++;
    this.isOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!carriesFiles(event)) return;
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.isOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    this.depth = 0;
    this.isOver.set(false);
    if (!carriesFiles(event)) return;
    event.preventDefault();
    const dropped = event.dataTransfer?.files;
    const files = dropped ? Array.from(dropped) : [];
    if (files.length) this.dropped.emit(files);
  }

  protected readonly title = $localize`:@@import.dropTitle:Drop to import`;
  protected readonly hint = $localize`:@@import.dropHint:Achordeon files, or a song image downloaded from Achordeon.`;
}

/**
 * Is this drag carrying files, rather than selected text or a link?
 *
 * `dataTransfer.files` is empty until the drop itself, so `types` is the only
 * thing readable during the drag — and reacting to a text drag would paint the
 * overlay over someone dragging a word around the editor.
 */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
