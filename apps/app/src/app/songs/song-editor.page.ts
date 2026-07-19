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
import { Button, Dialog, Icon, Tooltip, type IconName } from '../primitives';
import { Router, RouterLink } from '@angular/router';
import { ActionBar, BlankPage, SplitPane, UiStore } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { SongRender } from '../shared/song-render';
import { SongEditor } from './editor/song-editor';
import { SNIPPETS } from './editor/snippets';
import type { InsertRequest } from './editor/editor-model';
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
  host: { '(document:keydown.escape)': 'onEscape($event)' },
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
        <app-action-bar
          [title]="presenter.name()"
          [isTitleEditable]="true"
          [titleLabel]="nameLabel"
          (titleChange)="presenter.rename($event)"
        >
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

          <!-- One row when the width allows it, wrapping by GROUP when it does
               not (PRD-UI-SHELL.md §4). The commands wrap inside their own box;
               settings is a sibling of that box rather than a member of it,
               which is what keeps it on the first line no matter how many rows
               the commands take. -->
          <div class="bar-row">
            <div class="commands">
              <div
                class="group"
                role="group"
                [attr.aria-label]="insertGroupLabel"
              >
                @for (item of insertButtons; track item.testid) {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    class="insert"
                    [attr.aria-label]="item.label"
                    [appTooltip]="item.label"
                    [attr.data-testid]="item.testid"
                    (click)="editor().insert(item.snippet)"
                  >
                    <app-icon
                      [name]="item.icon"
                      [class.is-flipped]="item.isFlipped"
                    />
                    <!-- aria-hidden: the button is already named by its
                         aria-label, and "Title, star" helps nobody. -->
                    <span class="insert-syntax" aria-hidden="true">{{
                      item.glyph
                    }}</span>
                  </button>
                }
              </div>

              <div
                class="group"
                role="group"
                [attr.aria-label]="transposeGroupLabel"
              >
                <!-- A note badged with a direction. Transposing is a musical
                     act on the chords, and a bare arrow said only "move
                     something" — which something was left to the tooltip. -->
                <button
                  appButton
                  type="button"
                  variant="secondary"
                  class="transpose"
                  [isIconOnly]="true"
                  [attr.aria-label]="transposeUpLabel"
                  [appTooltip]="transposeUpLabel"
                  data-testid="transpose-up"
                  (click)="presenter.transpose(1)"
                >
                  <app-icon name="note" />
                  <app-icon class="transpose-badge" name="transposeUp" />
                </button>
                <button
                  appButton
                  type="button"
                  variant="secondary"
                  class="transpose"
                  [isIconOnly]="true"
                  [attr.aria-label]="transposeDownLabel"
                  [appTooltip]="transposeDownLabel"
                  data-testid="transpose-down"
                  (click)="presenter.transpose(-1)"
                >
                  <app-icon name="note" />
                  <app-icon class="transpose-badge" name="transposeDown" />
                </button>
              </div>

              <div
                class="group"
                role="group"
                [attr.aria-label]="historyGroupLabel"
              >
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
              </div>
            </div>

            <button
              appButton
              type="button"
              variant="secondary"
              class="settings"
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
      <app-blank-page pane-b [ratio]="aspectRatio()">
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

    /* The row does NOT wrap: it is the commands box and the settings button, and
       those two never share a line boundary. Top-aligned so that when the
       commands do wrap, settings stays level with the FIRST row rather than
       drifting to the vertical middle of a two-row bar. */
    .bar-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      inline-size: 100%;
    }

    /* This is what wraps, and it wraps between groups: a break falls where the
       meaning already changes (insert / transpose / history), never through the
       middle of one (PRD-UI-SHELL.md §4). */
    .commands {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      /* The gap between groups is the spacer — no empty elements needed; wrapped
         rows get the same separation as the row they broke out of. */
      gap: var(--space-1) var(--space-4);
    }

    .group {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    /* Two rows in one button: the mark, then the syntax it writes. Sized square
       so the bar still reads as a row of equal targets. */
    .insert {
      flex-direction: column;
      justify-content: center;
      gap: 0;
      inline-size: 40px;
      block-size: 40px;
      padding-inline: 0;
    }

    .insert app-icon {
      --icon-size: 17px;
    }

    .insert app-icon.is-flipped {
      transform: scaleX(-1);
    }

    /* Faint on purpose: it is the footnote, not the label. Monospace because it
       is a quotation of the source text. */
    .insert-syntax {
      font-family: var(--font-ui);
      font-size: 12px;
      line-height: 1;
      color: var(--text-faint);
      /* The chord glyph is three characters wide and was wrapping inside a 40px
         button, turning the footnote into two lines and shoving the icon up. */
      white-space: nowrap;
    }

    .insert:hover .insert-syntax {
      color: var(--text-muted);
    }

    /* Never squeezed by the commands, and pinned to the far end. */
    .settings {
      flex: none;
      margin-inline-start: auto;
    }

    /* The note is the subject, the arrow is the direction it moves — so the
       arrow is a corner badge rather than a second equal mark (the same
       composition the mobile module switcher uses for its hamburger). */
    .transpose {
      position: relative;
    }

    .transpose app-icon {
      --icon-size: 17px;
    }

    /* The direction is the thing you are choosing between the two buttons, so
       the arrow is nearly as large as the note rather than a small corner mark. */
    .transpose .transpose-badge {
      --icon-size: 15px;
      position: absolute;
      inset-block-start: 1px;
      inset-inline-end: 0;
      color: var(--brand);
    }
  `,
})
export class SongEditorPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongEditorPresenter);
  private readonly router = inject(Router);

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
   * looking at is the paper it prints on. The plan's box has already resolved the
   * setting's dialect (`A4`, `3:4`, a number) into pixels — so the render is
   * asked for its shape, not re-parsed.
   */
  protected readonly aspectRatio = computed(() => {
    const box = this.presenter.plan()?.box;
    return box && box.height > 0 ? box.width / box.height : 210 / 297;
  });

  protected readonly backLabel = $localize`:@@editor.back:Back to songs`;
  protected readonly nameLabel = $localize`:@@editor.name:Song name`;
  protected readonly insertGroupLabel = $localize`:@@editor.insertGroup:Insert`;
  protected readonly transposeGroupLabel = $localize`:@@editor.transposeGroup:Transpose`;
  protected readonly historyGroupLabel = $localize`:@@editor.historyGroup:History`;
  protected readonly transposeUpLabel = $localize`:@@editor.transposeUp:Transpose up a semitone`;
  protected readonly transposeDownLabel = $localize`:@@editor.transposeDown:Transpose down a semitone`;
  protected readonly settingsLabel = $localize`:@@editor.settings:Render settings`;
  protected readonly undoLabel = $localize`:@@editor.undo:Undo`;
  protected readonly redoLabel = $localize`:@@editor.redo:Redo`;

  /**
   * The insert bar: **a mark and the syntax it writes, stacked**.
   *
   * The glyphs used to be the whole button, on the reasoning that `[ ]` is what a
   * chord looks like in the text, so the button teaches the markup while you use
   * it. Half of them taught nothing: `*` and `**` are indistinguishable at a
   * glance and say "asterisk", not "title"; `:` and `¶` were guesses. So the
   * recognisable mark now carries the meaning and the glyph underneath keeps the
   * markup visible — you still learn the language from the bar, you just no
   * longer have to already know it to use the bar.
   *
   * `label` remains the accessible name and the tooltip; both the icon and the
   * glyph are decoration to a screen reader.
   */
  protected readonly insertButtons: readonly {
    testid: string;
    icon: IconName;
    /** Mirror the glyph horizontally — Lucide has a slash but no backslash. */
    isFlipped?: boolean;
    glyph: string;
    label: string;
    snippet: InsertRequest;
  }[] = [
    {
      testid: 'insert-chord',
      icon: 'brackets',
      glyph: '[ ]',
      label: $localize`:@@editor.insertChord:Chord`,
      snippet: SNIPPETS.chord,
    },
    {
      testid: 'insert-title',
      icon: 'heading1',
      glyph: '*',
      label: $localize`:@@editor.insertTitle:Title`,
      snippet: SNIPPETS.title,
    },
    {
      testid: 'insert-subtitle',
      icon: 'heading2',
      glyph: '**',
      label: $localize`:@@editor.insertSubtitle:Subtitle`,
      snippet: SNIPPETS.subtitle,
    },
    {
      testid: 'insert-label',
      icon: 'tag',
      glyph: ':',
      label: $localize`:@@editor.insertLabel:Label`,
      snippet: SNIPPETS.label,
    },
    {
      // A block boundary is a blank line, which has no character to show — `↵`
      // stands in for it, being the key you would press to make one.
      testid: 'insert-block',
      icon: 'pilcrow',
      glyph: '↵',
      label: $localize`:@@editor.insertBlock:New block`,
      snippet: SNIPPETS.block,
    },
    {
      testid: 'insert-escape',
      icon: 'backslash',
      // Lucide ships `slash` and no backslash, and an icon leaning the opposite
      // way to the character it writes is a small lie the eye catches.
      isFlipped: true,
      glyph: '\\',
      label: $localize`:@@editor.insertEscape:Escape the next character`,
      snippet: SNIPPETS.escape,
    },
  ];

  /**
   * Escape leaves the editor for the library.
   *
   * **Only when it is not already someone else's Escape.** The settings dialog
   * and the rename field both use it to mean "undo this smaller thing", and a key
   * that sometimes throws you out of the screen entirely is worse than no key at
   * all. So the dialog closes first and stops there, and a keypress that came
   * from a text field is left to the field.
   *
   * The guard reads the event's **target**, not `document.activeElement`: the
   * rename field blurs itself on Escape, so by the time this runs the active
   * element is already `<body>` and the field's Escape looked exactly like a bare
   * one. The target still names where the key was pressed.
   *
   * `input`/`textarea` only — deliberately **not** `isContentEditable`, because
   * the song editor itself is a contenteditable and Escape out of it is the whole
   * point of this handler.
   *
   * There is no keyboard-shortcut epic yet — the docs carry "custom shortcuts" as
   * TBD. This is one shortcut, not a keymap; full keyboard navigability is
   * recorded as a follow-up in `docs/achordeon-implementation.md` rather than
   * smuggled in here.
   */
  protected onEscape(event: Event): void {
    if (this.presenter.isSettingsOpen()) {
      this.presenter.closeSettings();
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    event.preventDefault();
    void this.router.navigate(['/songs']);
  }

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });
  }
}
