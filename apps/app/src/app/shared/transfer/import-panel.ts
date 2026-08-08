// Import panel — the file-PICKING half of import, shared by every module
//
// The import *flow* — read a file, preview what it would do, apply it, refresh the
// stores — belongs to `ImportInbox`, which is mounted once at the shell, and so do
// the dialogs it drives: a drop can land on a page that mounts no panel, and a
// link belongs to no page at all. Two dialogs racing for the same import is
// exactly what one owner prevents.
//
// What is left here is the one thing a page genuinely owns: **its own Import
// button's file input**. That is why both pages keep the button while nothing else
// about import is theirs any more.
//
// Controlled, like every panel in `app/shared`: it owns no store and no plan.

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The real control. Not display:none, which makes it unfocusable and, in
         some engines, unclickable from script. The page's own Import button
         calls pick() rather than styling a bare file input. -->
    <input
      #file
      class="file"
      type="file"
      [accept]="accept"
      multiple
      tabindex="-1"
      aria-hidden="true"
      [attr.data-testid]="inputTestid()"
      (change)="onPicked($event)"
    />
  `,
  styles: `
    /* Hidden, but still focusable and still clickable from script — hence not
       display:none.

       Every part of this rule is load-bearing against one bug: a scrollbar on
       <html> everywhere this panel is mounted.

       - overflow + clip-path: a file input is ~230×21 of native control whatever
         box you give it, and unclipped that spill counts towards the document's
         scrollable area.
       - position FIXED, not absolute: absolute with no positioned ancestor
         resolves against the initial containing block, so the box lands at its
         static position — which is inside a scrolling pane, often far below the
         fold — and a 1px box at y=1400 grows the document by 1400px. A fixed box
         contributes nothing to scrollable overflow, ever.

       Same rule, same reasons, in settings.page.ts. */
    .file {
      position: fixed;
      inset-block-start: 0;
      inset-inline-start: 0;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class ImportPanel {
  /** The file input's `data-testid` — each module names its own so a suite can
   * say which page's import it means. */
  readonly inputTestid = input('import-input');

  /** Files were chosen — the presenter hands them to the inbox. */
  readonly picked = output<File[]>();

  private readonly fileInput =
    viewChild.required<ElementRef<HTMLInputElement>>('file');

  /** Open the OS file picker. The page's Import button calls this. */
  pick(): void {
    this.fileInput().nativeElement.click();
  }

  /**
   * The picked files, and then the input is cleared.
   *
   * Without the reset, picking the same file twice in a row fires no `change`
   * the second time — the value has not changed — and the user is left pressing
   * a button that does nothing after cancelling out of the dialog once.
   */
  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) this.picked.emit(files);
  }

  /**
   * `.achordeon` is the registered extension; `.json` stays because every file
   * already exported is one. The PNG is the download that carries its own
   * metadata — "a picture of my song" and "my song" in one file.
   */
  protected readonly accept =
    'application/vnd.achordeon+json,.achordeon,application/json,.json,image/png,.png';
}
