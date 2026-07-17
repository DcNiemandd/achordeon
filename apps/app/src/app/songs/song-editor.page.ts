// Song editor page — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §4; ADR-0010

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Button, Dialog, Icon, Tooltip } from '../primitives';
import { RouterLink } from '@angular/router';
import { ActionBar, BlankPage, SplitPane, UiStore } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { SongRender } from '../shared/song-render';
import { SongEditor } from './editor/song-editor';
import { SNIPPETS } from './editor/snippets';
import { SongEditorPresenter } from './song-editor.presenter';

/**
 * The authoring screen: content on the left, the render on the right (§4).
 *
 * The insert/transpose bar (subtask 5), the live preview (subtask 6) and the
 * settings dialog (subtask 7) mount into this shape.
 */
@Component({
  selector: 'app-song-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongEditorPresenter],
  imports: [
    RouterLink,
    ActionBar,
    BlankPage,
    SplitPane,
    SongEditor,
    SongRender,
    SettingsPanel,
    Button,
    Dialog,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      [activePane]="activePane()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="presenter.name()">
          <!-- A link, because it navigates: it must middle-click, open in a
               new tab, and announce as a link (see the Button directive). -->
          <a
            appButton
            bar-end
            routerLink="/songs"
            [attr.aria-label]="backLabel"
            [appTooltip]="backLabel"
            data-testid="editor-back"
          >
            <app-icon name="close" />
          </a>

          <!-- Row 1: insert. Grouped by meaning, not by what happened to
               overflow (PRD-UI-SHELL.md §4). -->
          <div class="group" role="group" [attr.aria-label]="insertGroupLabel">
            @for (item of insertButtons; track item.testid) {
              <button
                appButton
                type="button"
                variant="secondary"
                [attr.aria-label]="item.label"
                [appTooltip]="item.label"
                [attr.data-testid]="item.testid"
                (click)="editor().insert(item.snippet)"
              >
                {{ item.glyph }}
              </button>
            }
          </div>

          <!-- Row 2: transform. -->
          <div
            class="group"
            role="group"
            [attr.aria-label]="transformGroupLabel"
          >
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [attr.aria-label]="transposeUpLabel"
              [appTooltip]="transposeUpLabel"
              data-testid="transpose-up"
              (click)="presenter.transpose(1)"
            >
              <app-icon name="transposeUp" />
            </button>
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [attr.aria-label]="transposeDownLabel"
              [appTooltip]="transposeDownLabel"
              data-testid="transpose-down"
              (click)="presenter.transpose(-1)"
            >
              <app-icon name="transposeDown" />
            </button>

            <span class="spacer"></span>

            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [attr.aria-label]="undoLabel"
              [appTooltip]="undoLabel"
              data-testid="editor-undo"
              (click)="editor().undo()"
            >
              <app-icon name="undo" />
            </button>
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [attr.aria-label]="redoLabel"
              [appTooltip]="redoLabel"
              data-testid="editor-redo"
              (click)="editor().redo()"
            >
              <app-icon name="redo" />
            </button>

            <span class="spacer"></span>

            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [class.is-active]="presenter.isSettingsOpen()"
              [attr.aria-pressed]="presenter.isSettingsOpen()"
              [attr.aria-label]="settingsLabel"
              [appTooltip]="settingsLabel"
              data-testid="editor-settings"
              (click)="presenter.toggleSettings()"
            >
              <app-icon name="settings" />
            </button>
          </div>
        </app-action-bar>

        <app-song-editor
          class="editor"
          [content]="presenter.content()"
          [markers]="presenter.markers()"
          (contentChange)="presenter.setContent($event)"
        />

        <!-- Centred on pane A with NO backdrop: you tune the render while
             watching it, so pane B stays fully visible and fully alive
             (PRD-UI-SHELL.md §4). The same panel the Settings page mounts at
             global scope — built once, bound here to this song. -->
        @if (presenter.isSettingsOpen()) {
          <app-dialog
            mode="container"
            [title]="settingsLabel"
            data-testid="song-settings-dialog"
            (closed)="presenter.closeSettings()"
          >
            <app-settings-panel
              scope="song"
              [values]="presenter.songSettings()"
              [inherited]="presenter.inheritedSettings()"
              (changed)="presenter.patchSettings($event)"
            />
          </app-dialog>
        }
      </div>

      <!-- Pane B: the render, live. Nothing sits above it — the action bar is
           pane A's (PRD-UI-SHELL.md §4). -->
      <app-blank-page pane-b [aspectRatio]="aspectRatio()">
        <app-song-render [svg]="presenter.svg()" />
      </app-blank-page>
    </app-split-pane>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    /* "Centred on pane A" means this: the dialog is absolutely positioned, so
       pane A has to be the box it positions against. */
    .pane {
      position: relative;
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .editor {
      flex: 1;
      min-block-size: 0;
      overflow: hidden;
    }

    /* Each group takes a full row of the action bar's wrapping flex line, so the
       rows break by MEANING (insert / transform) rather than wherever the width
       happens to run out (PRD-UI-SHELL.md §4). */
    .group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1);
      flex-basis: 100%;
    }

    /* Undo/redo are transforms too, but they are not transpose. */
    .spacer {
      inline-size: var(--space-3);
    }
  `,
})
export class SongEditorPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongEditorPresenter);

  /** `/songs/:id/edit`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * `?pane=source|render` — which pane to show below the breakpoint (§7). The
   * shell's bottom bar writes it; this reads it. Raw string in, narrowed here:
   * a URL holds text, not a union (see the songs page for the trap this avoids).
   */
  readonly pane = input<string | undefined>();

  protected readonly activePane = computed<'a' | 'b'>(() =>
    this.pane() === 'render' ? 'b' : 'a',
  );

  /** The adapter, for the commands that act on a cursor rather than on state:
   * inserting and undoing are things you do *to an editor* (ADR-0010). */
  protected readonly editor = viewChild.required(SongEditor);

  /**
   * The page frame follows the song's own aspect ratio, so the paper you are
   * looking at is the paper it prints on. `BlankPage` takes a CSS ratio; the
   * setting speaks the render's dialect (`A4`, `3:4`, a number), and the plan's
   * box is that ratio already resolved — so the render is asked, not re-parsed.
   */
  protected readonly aspectRatio = computed(() => {
    const box = this.presenter.plan()?.box;
    return box ? `${box.width} / ${box.height}` : '210 / 297';
  });

  protected readonly backLabel = $localize`:@@editor.back:Back to songs`;
  protected readonly insertGroupLabel = $localize`:@@editor.insertGroup:Insert`;
  protected readonly transformGroupLabel = $localize`:@@editor.transformGroup:Transform`;
  protected readonly transposeUpLabel = $localize`:@@editor.transposeUp:Transpose up a semitone`;
  protected readonly transposeDownLabel = $localize`:@@editor.transposeDown:Transpose down a semitone`;
  protected readonly settingsLabel = $localize`:@@editor.settings:Render settings`;
  protected readonly undoLabel = $localize`:@@editor.undo:Undo`;
  protected readonly redoLabel = $localize`:@@editor.redo:Redo`;

  /**
   * The insert bar. Glyphs are the **syntax itself** rather than icons: `[ ]` is
   * what a chord looks like in the text, so the button teaches the markup while
   * you use it — which is the point of having the buttons at all. The label is
   * the accessible name and the tooltip; the glyph is decoration.
   */
  protected readonly insertButtons = [
    {
      testid: 'insert-chord',
      glyph: '[ ]',
      label: $localize`:@@editor.insertChord:Chord`,
      snippet: SNIPPETS.chord,
    },
    {
      testid: 'insert-title',
      glyph: '*',
      label: $localize`:@@editor.insertTitle:Title`,
      snippet: SNIPPETS.title,
    },
    {
      testid: 'insert-subtitle',
      glyph: '**',
      label: $localize`:@@editor.insertSubtitle:Subtitle`,
      snippet: SNIPPETS.subtitle,
    },
    {
      testid: 'insert-label',
      glyph: ':',
      label: $localize`:@@editor.insertLabel:Label`,
      snippet: SNIPPETS.label,
    },
    {
      testid: 'insert-block',
      glyph: '¶',
      label: $localize`:@@editor.insertBlock:New block`,
      snippet: SNIPPETS.block,
    },
  ];

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });
  }
}
