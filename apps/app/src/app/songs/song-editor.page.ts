// Song editor page — Epic 5 ▸ subtask 4
// Spec: PRD-UI-SHELL.md §4; ADR-0010

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { Button, Dialog, Icon, Tooltip, type IconName } from '../primitives';
import { Router, RouterLink } from '@angular/router';
import {
  ActionBar,
  BlankPage,
  DocumentTitle,
  ReturnUrl,
  SplitPane,
  UiStore,
} from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { FeedbackContext } from '../shared/feedback';
import {
  KeyboardLayout,
  type ShortcutAction,
  ariaKeyShortcuts,
  registerShortcuts,
  withKeyHint,
} from '../shared/keyboard';
import { DownloadDialog } from '../shared/transfer';
import { SongRender } from '../shared/song-render';
import { SongEditor } from './editor/song-editor';
import { SNIPPETS } from './editor/snippets';
import type { InsertRequest } from './editor/editor-model';
import { SongEditorPresenter } from './song-editor.presenter';

/**
 * An action as the bar draws it: the declaration the keymap and the shortcuts
 * dialog read, widened with the face this particular bar gives it.
 */
interface BarAction extends ShortcutAction {
  readonly testid: string;
  readonly className?: string;
  readonly icon?: IconName;
  /** Mirror the glyph horizontally — Lucide has a slash but no backslash. */
  readonly isFlipped?: boolean;
  /** A second icon over the first — the direction badge on the transpose note. */
  readonly badge?: IconName;
  /** A character where there is no icon for the thing (♯, ♭). */
  readonly face?: string;
  /** The markup this writes, printed under the icon so the bar teaches it. */
  readonly syntax?: string;
  /** Drawn pressed, and announced as such: the settings toggle. */
  readonly isActive?: boolean;
  /** `aria-keyshortcuts`, filled in from `keys` — see `withHints`. */
  readonly keyHint?: string;
  /** The label with the key after it, for the tooltip — see `withHints`. */
  readonly tooltip?: string;
}

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
    DownloadDialog,
    Button,
    Dialog,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio('songs')"
      [activePane]="activePane()"
      (ratioChange)="ui.setSplitRatio('songs', $event)"
    >
      <div pane-a class="pane">
        <app-action-bar
          [title]="presenter.name()"
          [isTitleEditable]="true"
          [titleLabel]="nameLabel"
          (titleChange)="presenter.rename($event)"
        >
          <!-- A link, because it navigates: it must middle-click, open in a
               new tab, and announce as a link (see the Button directive). Both
               the path and the query come from the remembered where-from
               (ReturnUrl) — the library the editor was opened from, OR the
               songbook whose preview walked in here — so "back" lands on that
               screen as it was left, dialog and all, not a bare /songs. -->
          <a
            appButton
            bar-end
            [routerLink]="backPath()"
            [queryParams]="backParams()"
            [attr.aria-label]="backLabel()"
            [appTooltip]="backLabel()"
            data-testid="editor-back"
          >
            <app-icon name="close" />
          </a>

          <!-- One row when the width allows it, wrapping by GROUP when it does
               not (PRD-UI-SHELL.md §4). The insert / transpose / history groups
               AND the borderless actions (download, settings) share one wrapping
               box: the actions ride at its far end and tuck onto the last command
               row when it wraps. As a sibling column they instead forced a whole
               extra row on a phone — two rows of commands plus one of actions. -->
          <!-- Every button here is an entry in commandGroups / barActions, and
               so is its key and its row in the shortcuts dialog: one
               declaration per action, or a key and a greyed-out button could
               disagree about what is possible (ADR-0015). -->
          <div class="commands">
            @for (group of commandGroups(); track group.id) {
              <div class="group" role="group" [attr.aria-label]="group.label">
                @for (item of group.actions; track item.id) {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    [class]="item.className"
                    [isIconOnly]="!item.syntax"
                    [disabled]="item.isDisabled"
                    [attr.aria-label]="item.label"
                    [appTooltip]="item.tooltip ?? item.label"
                    [attr.aria-keyshortcuts]="item.keyHint"
                    [attr.data-testid]="item.testid"
                    (click)="item.run()"
                  >
                    @if (item.icon) {
                      <app-icon
                        [name]="item.icon"
                        [class.is-flipped]="item.isFlipped"
                      />
                    }
                    <!-- A note badged with a direction. Transposing is a
                         musical act on the chords, and a bare arrow said only
                         "move something" — which something was left to the
                         tooltip. -->
                    @if (item.badge) {
                      <app-icon class="transpose-badge" [name]="item.badge" />
                    }
                    @if (item.face) {
                      {{ item.face }}
                    }
                    <!-- aria-hidden: the button is already named by its
                         aria-label, and "Title, star" helps nobody. -->
                    @if (item.syntax) {
                      <span class="insert-syntax" aria-hidden="true">{{
                        item.syntax
                      }}</span>
                    }
                  </button>
                }
              </div>
            }

            <!-- These are plain actions, not code-editing commands, so they are
                 borderless (ghost) — the bordered buttons on the left are the ones
                 that write into the text. The same borderless set as the library
                 list and the songbook detail. Last in the command box, pushed to
                 its far end, so they sit far-right on one row and fall onto the
                 last command row (never a row of their own) when it wraps. -->
            <div class="bar-actions">
              @for (item of barActions(); track item.id) {
                <button
                  appButton
                  type="button"
                  [class]="item.className"
                  [isIconOnly]="true"
                  [class.is-active]="item.isActive"
                  [attr.aria-pressed]="item.isActive"
                  [attr.aria-label]="item.label"
                  [appTooltip]="item.tooltip ?? item.label"
                  [attr.aria-keyshortcuts]="item.keyHint"
                  [attr.data-testid]="item.testid"
                  (click)="item.run()"
                >
                  @if (item.icon) {
                    <app-icon [name]="item.icon" />
                  }
                </button>
              }
            </div>
          </div>
        </app-action-bar>

        <!-- The notation bound here is the song's resolved setting, the same
             one pane B prints with: the sharp/flat buttons rewrite the source,
             and the spelling they leave behind should be the one the author
             reads. -->
        <app-song-editor
          class="editor"
          [content]="presenter.content()"
          [markers]="presenter.markers()"
          [notation]="presenter.notation()"
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

        <!-- The download sheet — one song, so it offers PDF, PNG or the
             Achordeon file (its count is 1). The same dialog the library list
             opens. -->
        @if (presenter.isDownloadOpen()) {
          <app-download-dialog
            [count]="1"
            [busy]="presenter.isDownloading()"
            [isShareLinkReady]="presenter.isShareLinkReady()"
            (chosen)="presenter.download($event)"
            (closed)="presenter.closeDownload()"
          />
        }
      </div>

      <!-- Pane B: the render, live. Nothing sits above it — the action bar is
           pane A's (PRD-UI-SHELL.md §4). -->
      <app-blank-page pane-b [ratio]="aspectRatio()" [isDark]="ui.isSongDark()">
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

    /* A group wraps too — but only ever as the last resort, because .commands
       above breaks between groups first and a group is only asked to break when
       it alone is wider than the line. Eight 40px inserts plus their gaps are
       348px; a 320px phone has ~215px left after the bar's padding and the
       download/settings pair, so "never break a group" had no way to hold there
       and the group simply overflowed the viewport instead. Wrapping inside the
       group keeps the preference (breaks still fall between groups whenever
       there is room to) and gives it a floor when there is not. */
    .group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      min-inline-size: 0;
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

    /* Download and settings ride together at the far end of the command box:
       margin-auto keeps them hard right on a single row, and lets them fall onto
       the last command row when it wraps rather than claiming a row of their own. */
    .bar-actions {
      flex: none;
      margin-inline-start: auto;
      display: flex;
      gap: var(--space-1);
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

    /* The accidental buttons show their glyph as text, not an icon — ♯ and ♭ are
       the mark, sized up to read at a button's scale. */
    .accidental {
      font-family: var(--font-ui);
      font-size: 18px;
      line-height: 1;
    }
  `,
})
export class SongEditorPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongEditorPresenter);
  private readonly router = inject(Router);
  private readonly returnUrl = inject(ReturnUrl);
  private readonly layout = inject(KeyboardLayout);

  /** The list's query params, pulled off the remembered list URL — what makes
   * the back link and Escape restore search/sort/favourites (and, from a
   * songbook, the open preview). Empty (a bare /songs) when the editor was
   * reached cold, e.g. a reload. */
  protected readonly backParams = computed(
    () => this.router.parseUrl(this.returnUrl.url() ?? '/songs').queryParams,
  );

  /**
   * The **path** of the remembered where-from, query stripped off (that is
   * `backParams`' job). `/songs` when the editor was reached cold. This is what
   * lets the visible Back link return to a *songbook* — the editor now has two
   * entrances, and a hard-coded `/songs` could only serve one of them.
   */
  protected readonly backPath = computed(
    () => (this.returnUrl.url() ?? '/songs').split('?')[0] || '/songs',
  );

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

  /** For the rename shortcut: the name lives in the bar's heading, so renaming
   * from the keyboard is a matter of reaching the field already on screen. */
  private readonly bar = viewChild(ActionBar);

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

  /** Names where Back goes — a songbook when that is where the editor was
   * opened from, the library otherwise. The glyph is the same X either way; this
   * is the accessible name and the tooltip behind it. */
  protected readonly backLabel = computed(() =>
    this.backPath().startsWith('/songbooks')
      ? $localize`:@@editor.backToSongbook:Back to the songbook`
      : $localize`:@@editor.back:Back to songs`,
  );
  protected readonly nameLabel = $localize`:@@editor.name:Song name`;
  protected readonly insertGroupLabel = $localize`:@@editor.insertGroup:Insert`;
  protected readonly transposeGroupLabel = $localize`:@@editor.transposeGroup:Transpose`;
  protected readonly historyGroupLabel = $localize`:@@editor.historyGroup:History`;
  protected readonly transposeUpLabel = $localize`:@@editor.transposeUp:Transpose up a semitone`;
  protected readonly transposeDownLabel = $localize`:@@editor.transposeDown:Transpose down a semitone`;
  protected readonly sharpLabel = $localize`:@@editor.sharp:Raise this chord a semitone`;
  protected readonly flatLabel = $localize`:@@editor.flat:Lower this chord a semitone`;
  protected readonly settingsLabel = $localize`:@@editor.settings:Render settings`;
  protected readonly downloadLabel = $localize`:@@editor.download:Download`;
  protected readonly undoLabel = $localize`:@@editor.undo:Undo`;
  protected readonly redoLabel = $localize`:@@editor.redo:Redo`;
  protected readonly focusEditorLabel = $localize`:@@editor.focusEditor:Go to the song text`;
  protected readonly closeDialogLabel = $localize`:@@editor.closeDialog:Close`;
  protected readonly dialogGroupLabel = $localize`:@@editor.dialogGroup:Dialog`;
  /** Names this screen's group in the shortcuts dialog. */
  protected readonly editorGroupLabel = $localize`:@@editor.group:Editor`;

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
   *
   * **Greyed out where the line's grammar would ignore what it writes.** A `*` or
   * `**` line never reaches the inline scan (PARSER-GRAMMAR §Phase 1), so a chord
   * typed into a title is not a chord — it is the literal text `[C]`, which then
   * prints on the page. Same for a label. Brackets do not nest either: a `[`
   * written inside one closes nothing and the parser reads the whole thing as a
   * single malformed bracket. Disabled rather than hidden, because a bar whose
   * buttons come and go as the caret moves is harder to use than one where a
   * button greys out — and the tooltip still names what it would have done. The
   * key is disabled with the button: that is what one declaration buys.
   */
  private readonly insertActions = computed<readonly BarAction[]>(() => {
    const caret = this.editor().caret();
    const isContentLine = caret.lineKind === 'content';
    const write =
      (snippet: InsertRequest): (() => void) =>
      () =>
        this.editor().insert(snippet);
    return this.withHints([
      {
        // The one button that is NOT blocked inside a bracket: there it means
        // "make this chord inline", and pressing it once more takes the brackets
        // off — bracket, inline, plain, round again (`cycleChordAt`).
        id: 'editor.chord',
        testid: 'insert-chord',
        className: 'insert',
        icon: 'brackets',
        syntax: '[ ]',
        label: $localize`:@@editor.insertChord:Chord`,
        keys: ['Alt+KeyC'],
        isDisabled: !isContentLine,
        run: () => this.editor().cycleChord(SNIPPETS.chord),
      },
      {
        id: 'editor.title',
        testid: 'insert-title',
        className: 'insert',
        icon: 'heading1',
        syntax: '*',
        label: $localize`:@@editor.insertTitle:Title`,
        keys: ['Alt+KeyT'],
        run: write(SNIPPETS.title),
      },
      {
        id: 'editor.subtitle',
        testid: 'insert-subtitle',
        className: 'insert',
        icon: 'heading2',
        syntax: '**',
        label: $localize`:@@editor.insertSubtitle:Subtitle`,
        keys: ['Alt+KeyS'],
        run: write(SNIPPETS.subtitle),
      },
      {
        id: 'editor.label',
        testid: 'insert-label',
        className: 'insert',
        icon: 'tag',
        syntax: ':',
        label: $localize`:@@editor.insertLabel:Label`,
        keys: ['Alt+KeyL'],
        isDisabled: !isContentLine,
        run: write(SNIPPETS.label),
      },
      {
        // Emphasis is content-only and cannot live in a chord: `**` on a title
        // line is literal, and inside a bracket the asterisks are chord text.
        id: 'editor.bold',
        testid: 'insert-bold',
        className: 'insert',
        icon: 'bold',
        syntax: '**',
        label: $localize`:@@editor.insertBold:Bold`,
        keys: ['Alt+KeyB'],
        isDisabled: !isContentLine || caret.isInsideChord,
        run: write(SNIPPETS.bold),
      },
      {
        id: 'editor.italic',
        testid: 'insert-italic',
        className: 'insert',
        icon: 'italic',
        syntax: '*',
        label: $localize`:@@editor.insertItalic:Italic`,
        keys: ['Alt+KeyI'],
        isDisabled: !isContentLine || caret.isInsideChord,
        run: write(SNIPPETS.italic),
      },
      {
        // A block boundary is a blank line, which has no character to show — `↵`
        // stands in for it, being the key you would press to make one.
        id: 'editor.block',
        testid: 'insert-block',
        className: 'insert',
        icon: 'pilcrow',
        syntax: '↵',
        label: $localize`:@@editor.insertBlock:New block`,
        keys: ['Alt+Enter'],
        run: write(SNIPPETS.block),
      },
      {
        id: 'editor.escape',
        testid: 'insert-escape',
        className: 'insert',
        icon: 'backslash',
        // Lucide ships `slash` and no backslash, and an icon leaning the opposite
        // way to the character it writes is a small lie the eye catches.
        isFlipped: true,
        syntax: '\\',
        label: $localize`:@@editor.insertEscape:Escape the next character`,
        keys: ['Alt+Backslash'],
        run: write(SNIPPETS.escape),
      },
    ]);
  });

  /**
   * Transposing, whole song and one chord.
   *
   * Sharp/flat raise or lower the ONE chord under the cursor, and so are enabled
   * only while the caret is inside a chord — off a chord there is nothing for
   * them to change. Their keys are the brackets, which is where a chord's own
   * `[` and `]` live: `Alt` plus the bracket that closes it raises, the one that
   * opens it lowers.
   */
  private readonly transposeActions = computed<readonly BarAction[]>(() => {
    const isInsideChord = this.editor().caret().isInsideChord;
    return this.withHints([
      {
        id: 'editor.transposeUp',
        testid: 'transpose-up',
        className: 'transpose',
        icon: 'note',
        badge: 'transposeUp',
        label: this.transposeUpLabel,
        keys: ['Alt+Equal'],
        run: () => this.presenter.transpose(1),
      },
      {
        id: 'editor.transposeDown',
        testid: 'transpose-down',
        className: 'transpose',
        icon: 'note',
        badge: 'transposeDown',
        label: this.transposeDownLabel,
        keys: ['Alt+Minus'],
        run: () => this.presenter.transpose(-1),
      },
      {
        id: 'editor.sharp',
        testid: 'chord-sharp',
        className: 'accidental',
        face: '♯',
        label: this.sharpLabel,
        keys: ['Alt+BracketRight'],
        isDisabled: !isInsideChord,
        run: () => this.editor().transposeChordAtCaret(1),
      },
      {
        id: 'editor.flat',
        testid: 'chord-flat',
        className: 'accidental',
        face: '♭',
        label: this.flatLabel,
        keys: ['Alt+BracketLeft'],
        isDisabled: !isInsideChord,
        run: () => this.editor().transposeChordAtCaret(-1),
      },
    ]);
  });

  /**
   * Undo and redo — **listed, not bound** (`isUnbound`).
   *
   * The history is CodeMirror's (ADR-0010) and its keymap matches the character
   * produced, not the position. Everything else here binds to a position, and a
   * Czech QWERTZ swaps exactly the two letters this uses — so a second binding
   * of our own would put undo under a different finger than the editor's own.
   * The dialog still says what the keys are, because the user needs to know.
   */
  private readonly historyActions = computed<readonly BarAction[]>(() =>
    this.withHints([
      {
        id: 'editor.undo',
        testid: 'editor-undo',
        icon: 'undo',
        label: this.undoLabel,
        keys: ['Ctrl+z'],
        isUnbound: true,
        run: () => this.editor().undo(),
      },
      {
        id: 'editor.redo',
        testid: 'editor-redo',
        icon: 'redo',
        label: this.redoLabel,
        keys: ['Ctrl+y', 'Ctrl+Shift+z'],
        isUnbound: true,
        run: () => this.editor().redo(),
      },
    ]),
  );

  /** The three bordered groups, in the order the bar wraps them. */
  protected readonly commandGroups = computed(() => [
    {
      id: 'insert',
      label: this.insertGroupLabel,
      actions: this.insertActions(),
    },
    {
      id: 'transpose',
      label: this.transposeGroupLabel,
      actions: this.transposeActions(),
    },
    {
      id: 'history',
      label: this.historyGroupLabel,
      actions: this.historyActions(),
    },
  ]);

  /**
   * The borderless pair at the far end.
   *
   * Download takes the song away in whichever of the three shapes: a page, a
   * picture, or the Achordeon file. One button and one dialog, as everywhere
   * else — Export used to be a second icon here, and the pair asked you to know
   * the difference before it would show you either.
   */
  protected readonly barActions = computed<readonly BarAction[]>(() =>
    this.withHints([
      {
        id: 'editor.download',
        testid: 'editor-download',
        icon: 'download',
        label: this.downloadLabel,
        keys: ['Alt+KeyD'],
        run: () => this.presenter.openDownload(),
      },
      {
        id: 'editor.settings',
        testid: 'editor-settings',
        className: 'settings',
        icon: 'settings',
        label: this.settingsLabel,
        keys: ['Alt+Comma'],
        isActive: this.presenter.isSettingsOpen(),
        run: () => this.presenter.toggleSettings(),
      },
    ]),
  );

  /**
   * Everything the editor answers to, bar buttons included (ADR-0015).
   *
   * The two that have no button: renaming, which puts the caret in the heading
   * the bar already draws, and Escape.
   *
   * **Escape is scoped, not guarded.** `outside-fields` is the rule the
   * hand-written handler used to spell out: a press that came from an
   * `input`/`textarea` belongs to that field, which uses Escape to mean "undo
   * this smaller thing" — deliberately *not* extended to `contenteditable`,
   * because the song editor is one and leaving it is the whole point. The
   * dialog case is no longer a guard at all: an open dialog puts a blocking
   * layer on top of this one.
   */
  private readonly editorShortcuts = computed<readonly ShortcutAction[]>(() => [
    ...this.insertActions(),
    ...this.transposeActions(),
    ...this.historyActions(),
    ...this.barActions(),
    {
      id: 'editor.rename',
      label: this.nameLabel,
      keys: ['Alt+KeyR'],
      run: () => this.bar()?.startRename(),
    },
    {
      // The way back to the text. Everything above acts *on* the song from
      // outside it; this is how you get in without tabbing past the entire bar.
      id: 'editor.focus',
      label: this.focusEditorLabel,
      keys: ['Alt+KeyE'],
      run: () => this.editor().focus(),
    },
    {
      id: 'editor.leave',
      label: this.backLabel(),
      keys: ['Escape'],
      scope: 'outside-fields',
      // The remembered list URL — search, sort and all — not a bare /songs (see
      // ReturnUrl). The same place the back link points.
      run: () =>
        void this.router.navigateByUrl(this.returnUrl.url() ?? '/songs'),
    },
  ]);

  /**
   * An open dialog, shadowing the editor beneath it.
   *
   * `app-dialog` stops an Escape pressed *inside* it from ever reaching the
   * document, so this is for the other case: focus that wandered back to the
   * page while a dialog is still up. Without it, Escape would close the dialog
   * and leave the editor in the same press.
   */
  private readonly isDialogOpen = computed(
    () => this.presenter.isSettingsOpen() || this.presenter.isDownloadOpen(),
  );

  private readonly dialogShortcuts = computed<readonly ShortcutAction[]>(() =>
    this.isDialogOpen()
      ? [
          {
            id: 'editor.closeDialog',
            label: this.closeDialogLabel,
            keys: ['Escape'],
            run: () =>
              this.presenter.isSettingsOpen()
                ? this.presenter.closeSettings()
                : this.presenter.closeDownload(),
          },
        ]
      : [],
  );

  /**
   * The key each button carries, in this keyboard's own glyphs: once in
   * `aria-keyshortcuts` for a screen reader, once at the end of the tooltip for
   * everybody else.
   *
   * The tooltip is where a shortcut is actually learned — you find it while
   * reaching for the button with the mouse, which is the moment you are asking
   * "is there a faster way?". The dialog answers the same question, but only for
   * somebody who already suspects the answer.
   */
  private withHints(items: readonly BarAction[]): readonly BarAction[] {
    const labels = this.layout.labels();
    return items.map((item) =>
      item.keys.length === 0
        ? item
        : {
            ...item,
            keyHint: ariaKeyShortcuts(item.keys[0], labels),
            tooltip: withKeyHint(item.label, item.keys[0], labels),
          },
    );
  }

  constructor() {
    // A dialog goes on top of the editor's own keys, so while one is up it is
    // the only layer anything reaches.
    registerShortcuts({
      name: this.editorGroupLabel,
      actions: this.editorShortcuts,
    });
    registerShortcuts({
      name: this.dialogGroupLabel,
      isBlocking: this.isDialogOpen,
      actions: this.dialogShortcuts,
    });

    // `untracked` for the same reason the stage's does: `load()` reads the song
    // store's entity list to find the song before it falls back to a fetch, so a
    // plain effect re-ran on *every* store change — including the autosave's own
    // write-back, which then re-set `_content` from the saved row and would have
    // discarded whatever was typed since. The route param is the trigger; what
    // the load reads on the way is not.
    effect(() => {
      const id = this.id();
      untracked(() => void this.presenter.load(id));
    });

    // The tab names the song, not the module: this is a document, and a rename
    // from the title field reaches the tab because `claim` takes the accessor
    // rather than the string.
    inject(DestroyRef).onDestroy(
      inject(DocumentTitle).claim(() => this.presenter.name()),
    );

    // Declare this song to the report dialog, so "found a bug?" can offer to
    // attach the thing the bug is about instead of asking for it in prose. Only
    // the name is passed eagerly — it is what the checkbox says. The snapshot
    // behind it is fetched if, and only if, that box is ticked.
    const feedback = inject(FeedbackContext);
    effect(() => {
      feedback.set({
        kind: 'song',
        name: this.presenter.name(),
        snapshot: () => this.presenter.feedbackSnapshot(),
      });
    });
    inject(DestroyRef).onDestroy(() => feedback.release());
  }
}
