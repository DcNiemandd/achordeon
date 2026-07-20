// Songbook detail page — Epic 6 ▸ subtasks 2–6
// Spec: PRD-UI-SHELL.md §4 (pane A: song explorer, pane B: songbook entries)
//
// This is the songbook builder. Epic 5's in-use delete warning links straight
// here — CONTEXT.md §Delete vs Remove promises "a link that opens the Songbook
// and auto-selects the Song" — so the song is already current when this mounts.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Button,
  Dialog,
  Field,
  Icon,
  Tooltip,
  type IconName,
} from '../primitives';
import { ActionBar, SplitPane, UiStore } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import {
  ENTRY_CAPABILITIES,
  READONLY_ENTRY_CAPABILITIES,
  REDUCED_CAPABILITIES,
  SelectionStatus,
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerSort,
} from '../shared/song-explorer';
import type { InsertPosition } from './entry-ops';
import { SongbookDetailPresenter } from './songbook-detail.presenter';

/**
 * The library on the left, the songbook on the right (§4).
 *
 * Pane A is the **same** `<app-song-explorer>` the Songs module mounts, at
 * reduced capability: search, sort, select and favorite stay; edit, rename,
 * duplicate and delete go. You are picking songs here, not administering them —
 * renaming a song from inside a songbook edits the *library*, which is a
 * different job in a different module (CONTEXT.md §Song explorer).
 */
@Component({
  selector: 'app-songbook-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongbookDetailPresenter],
  imports: [
    RouterLink,
    ActionBar,
    SplitPane,
    SongExplorer,
    SelectionStatus,
    SettingsPanel,
    Button,
    Dialog,
    Field,
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
          [isTitleEditable]="!presenter.isVirtual()"
          [titleLabel]="nameLabel"
          (titleChange)="presenter.rename($event)"
        >
          <a
            appButton
            bar-end
            routerLink="/songbooks"
            [attr.aria-label]="backLabel"
            [appTooltip]="backLabel"
            data-testid="songbook-back"
          >
            <app-icon name="close" />
          </a>

          @if (!presenter.isVirtual()) {
            <!-- Same control, same place as the Songs module: the count and its
                 Clear belong above the list they describe, not in the transfer
                 column between the panes — there it read as a fifth transfer
                 button and sat nowhere near the list it empties. -->
            <app-selection-status
              class="selection"
              [count]="presenter.selectedIds().size"
              (cleared)="presenter.clearSelection()"
            />

            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [class.is-active]="presenter.isSettingsOpen()"
              [attr.aria-pressed]="presenter.isSettingsOpen()"
              [attr.aria-label]="settingsLabel"
              [appTooltip]="settingsLabel"
              data-testid="songbook-settings"
              (click)="presenter.toggleSettings()"
            >
              <app-icon name="settings" />
            </button>
          }
        </app-action-bar>

        <!-- The songbook's own scope of the cascade, plus the title-page fields
             that only a songbook has. A modal, unlike the editor's: there is no
             live render behind it to keep watching (§4). -->
        @if (presenter.isSettingsOpen()) {
          <app-dialog
            [title]="settingsLabel"
            data-testid="songbook-settings-dialog"
            (closed)="presenter.closeSettings()"
          >
            <section class="fields">
              <h3 class="fields-title">{{ titlePageHeading }}</h3>
              <p class="fields-help">{{ titlePageHelp }}</p>

              @for (field of titleFields; track field.key) {
                <label class="field">
                  <span class="field-label">{{ field.label }}</span>
                  <input
                    appField
                    type="text"
                    [value]="presenter.titleFields()[field.key]"
                    [attr.data-testid]="'songbook-' + field.key"
                    (change)="setField(field.key, $event)"
                  />
                </label>
              }
            </section>

            <!-- The SAME panel the Settings page and the song editor mount, at
                 songbook scope: chord colour and size re-theme every song
                 performed in this book (CONTEXT.md §Render settings). -->
            <app-settings-panel
              scope="songbook"
              [values]="presenter.songbookSettings()"
              [inherited]="presenter.inheritedSettings()"
              (changed)="presenter.patchSettings($event)"
            />
          </app-dialog>
        }

        <!-- The library and, hard against the divider, the column that moves
             rows across it. The transfer buttons sit BETWEEN the two lists —
             they belong to neither, they are the crossing itself. -->
        <div class="body">
          <app-song-explorer
            class="explorer"
            [rows]="presenter.rows()"
            [capabilities]="capabilities"
            [query]="query()"
            [sort]="sortKey()"
            [dir]="presenter.effectiveDir(sortKey(), sortDir())"
            [selectedIds]="presenter.selectedIds()"
            [currentId]="presenter.currentId()"
            [emptyText]="emptyText()"
            (queryChange)="presenter.setQuery($event)"
            (sortChange)="presenter.setSort($event)"
            (loadMore)="presenter.loadMore()"
            (activated)="presenter.activate($event)"
            (selectToggled)="presenter.toggleSelect($event)"
            (favorited)="presenter.toggleFavorite($event)"
          />

          @if (!presenter.isVirtual()) {
            <div
              class="transfer"
              role="toolbar"
              aria-orientation="vertical"
              [attr.aria-label]="addGroupLabel"
              data-testid="songbook-add"
            >
              @for (option of addOptions; track option.where) {
                <!-- Hover or focus previews the landing position: the entry
                     list draws a line there, so "above" stops being a word you
                     have to take on trust. -->
                <button
                  appButton
                  type="button"
                  variant="secondary"
                  class="cross"
                  [isIconOnly]="true"
                  [disabled]="!hasSelection()"
                  [attr.aria-label]="addLabel(option)"
                  [appTooltip]="addLabel(option)"
                  [attr.data-testid]="'add-' + option.where"
                  (pointerenter)="preview.set(option.where)"
                  (pointerleave)="preview.set(null)"
                  (focus)="preview.set(option.where)"
                  (blur)="preview.set(null)"
                  (click)="presenter.addSelected(option.where)"
                >
                  <app-icon [name]="option.icon" />
                </button>
              }

              <!-- Set apart, and pointing the other way: it crosses the same
                   gap in the opposite direction, and it answers pane B's
                   selection rather than pane A's. -->
              <button
                appButton
                type="button"
                variant="secondary"
                class="cross out"
                [isIconOnly]="true"
                [disabled]="!hasSlotSelection()"
                [attr.aria-label]="removeSlotsLabel"
                [appTooltip]="removeSlotsLabel"
                data-testid="entry-remove-selected"
                (click)="presenter.removeSlots([...presenter.selectedSlots()])"
              >
                <app-icon name="transferOut" />
              </button>
            </div>
          }
        </div>
      </div>

      <div pane-b class="pane">
        <!-- Pane B's own strip, not the action bar: the action bar is pane A's
             (§4), and these act on the slots ticked HERE. The virtual book has
             a read-only order, so it gets no strip at all. -->
        @if (!presenter.isVirtual()) {
          <div
            class="entry-tools"
            role="toolbar"
            [attr.aria-label]="reorderGroupLabel"
            data-testid="entry-tools"
          >
            @for (option of moveOptions; track option.where) {
              <button
                appButton
                type="button"
                variant="secondary"
                [isIconOnly]="true"
                [disabled]="!hasSlotSelection()"
                [attr.aria-label]="option.label"
                [appTooltip]="option.label"
                [attr.data-testid]="'move-' + option.where"
                (click)="presenter.moveSelected(option.where)"
              >
                <app-icon [name]="option.icon" />
              </button>
            }

            <!-- The hint explains the greyed buttons, so it goes when they
                 come alive; the Clear that replaces it carries the count. Same
                 control, same words as the library side. -->
            @if (hasSlotSelection()) {
              <app-selection-status
                class="entry-clear"
                [count]="presenter.selectedSlots().size"
                (cleared)="presenter.clearSlotSelection()"
              />
            } @else {
              <span class="entry-hint">{{ slotSelectionLabel }}</span>
            }
          </div>
        }

        <!-- **The same list component as pane A**, a third capability set:
             numbered, removable, no search or sort (the order IS the content).
             Two lists side by side that answered the same click differently was
             the bug; one component cannot drift from itself. -->
        <app-song-explorer
          class="entries"
          data-testid="songbook-detail"
          rowTestid="entry-row"
          [rows]="presenter.entries()"
          [capabilities]="entryCapabilities()"
          [selectedIds]="presenter.selectedSlots()"
          [currentId]="presenter.currentSlot()"
          [insertAt]="previewIndex()"
          [emptyText]="entriesEmptyText()"
          (selectToggled)="presenter.toggleSelectSlot($event)"
          (activated)="presenter.activateSlot($event)"
          (removed)="presenter.removeSlots($event)"
        />
      </div>
    </app-split-pane>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    /* The library and the transfer column, side by side under the bar. */
    .body {
      flex: 1;
      min-block-size: 0;
      display: flex;
      min-inline-size: 0;
    }

    .explorer {
      flex: 1;
      min-inline-size: 0;
    }

    .entries {
      flex: 1;
      min-block-size: 0;
    }

    /* Between the two lists, hard against the divider — the buttons belong to
       neither pane, they are the crossing. Padded down so they start level with
       the first row rather than with the explorer's search box. */
    .transfer {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-1);
      padding: var(--space-2);
      padding-block-start: 60px;
      border-inline-start: 1px solid var(--border);
      background: var(--surface-raised);
    }

    .cross app-icon {
      --icon-size: 17px;
    }

    /* Set apart from the four that go the other way: it is a different
       direction answering a different pane's selection. */
    .cross.out {
      margin-block-start: var(--space-3);
    }

    .clear {
      padding-inline: var(--space-1);
      font-size: var(--text-xs);
      color: var(--brand);
      white-space: nowrap;
    }

    /* Ahead of the settings button, at the end of the action row — the Songs
       module's position. */
    .selection {
      margin-inline-start: auto;
    }

    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 0 var(--space-3) var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    .fields-title {
      margin: 0;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .fields-help {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .field-label {
      font-size: var(--text-sm);
    }

    .entry-tools {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: var(--space-2);
      border-block-end: 1px solid var(--border);
    }

    /* Says what the buttons beside it need before they do anything, so a row of
       disabled icons is not a puzzle. After them, not before: the controls sit
       at the start of the strip (where a search box would be), and the sentence
       explains them from the right. */
    .entry-clear {
      margin-inline-start: var(--space-2);
    }

    .entry-hint {
      flex: 1;
      min-inline-size: 0;
      margin-inline-start: var(--space-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }
  `,
})
export class SongbookDetailPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongbookDetailPresenter);

  /** `/songbooks/:id`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * `?q=` / `?sort=` / `?dir=` / `?pane=`, from the URL. Raw strings in and
   * narrowed here: router input binding sets every declared input on each
   * navigation, so an absent param arrives as an explicit `undefined` that would
   * overwrite an `input()` default (see the songs page for the trap).
   */
  readonly q = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly dir = input<string | undefined>();
  readonly pane = input<string | undefined>();

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly sortKey = computed<ExplorerSort>(
    () => toExplorerSort(this.sort()) ?? 'name',
  );
  protected readonly sortDir = computed(() => toExplorerSortDir(this.dir()));
  protected readonly activePane = computed<'a' | 'b'>(() =>
    this.pane() === 'render' ? 'b' : 'a',
  );

  /** The Songbooks panel's capability set: identity/destructive actions off. */
  protected readonly capabilities = REDUCED_CAPABILITIES;

  /** The virtual book's order is read-only, so its slots cannot be picked. */
  protected readonly entryCapabilities = computed(() =>
    this.presenter.isVirtual()
      ? READONLY_ENTRY_CAPABILITIES
      : ENTRY_CAPABILITIES,
  );

  protected readonly backLabel = $localize`:@@songbooks.back:Back to songbooks`;
  protected readonly nameLabel = $localize`:@@songbooks.name:Songbook name`;
  protected readonly settingsLabel = $localize`:@@songbooks.settings:Songbook settings`;
  protected readonly titlePageHeading = $localize`:@@songbooks.titlePage:Title page`;
  protected readonly titlePageHelp = $localize`:@@songbooks.titlePage.help:Printed on the songbook's title page. Separate from any song's own title.`;

  /** The songbook's own metadata — authored here, never parsed (ADR-0001). */
  protected readonly titleFields = [
    {
      key: 'title' as const,
      label: $localize`:@@songbooks.field.title:Title`,
    },
    {
      key: 'subtitle' as const,
      label: $localize`:@@songbooks.field.subtitle:Subtitle`,
    },
    {
      key: 'author' as const,
      label: $localize`:@@songbooks.field.author:Author`,
    },
  ];

  protected setField(key: 'title' | 'subtitle' | 'author', event: Event): void {
    void this.presenter.setTitleField(
      key,
      (event.target as HTMLInputElement).value,
    );
  }

  protected readonly emptyText = computed(() =>
    this.query()
      ? $localize`:@@songs.noMatches:No songs match your search.`
      : $localize`:@@songs.empty:No songs yet. Create one to get started.`,
  );

  protected readonly hasSelection = computed(
    () => this.presenter.selectedIds().size > 0,
  );

  protected readonly addGroupLabel = $localize`:@@songbooks.addGroup:Add to the songbook`;

  /**
   * Which Add button the pointer or focus is on, so the entry list can show
   * where its songs would land. Null when nothing is hovered.
   */
  protected readonly preview = signal<InsertPosition | null>(null);

  protected readonly previewIndex = computed(() => {
    const where = this.preview();
    return where === null ? null : this.presenter.insertAt(where);
  });

  /**
   * The four places to put them, in the **reorder set's own glyphs** — up/down
   * for a step, arrow-into-a-line for an end. They briefly wore a right arrow
   * with the position badged onto it, to say "across into the book"; the
   * direction is already obvious from which pane you are looking at, and the
   * badge cost the position mark its legibility.
   *
   * The label names the **resolved** position, not the rule: "Add above slot 3"
   * rather than "add above the selection", because the whole complaint was that
   * you could not tell where they were going to land.
   */
  protected readonly addOptions: readonly {
    where: InsertPosition;
    icon: IconName;
  }[] = [
    { where: 'start', icon: 'moveStart' },
    { where: 'above', icon: 'moveUp' },
    { where: 'below', icon: 'moveDown' },
    { where: 'end', icon: 'moveEnd' },
  ];

  protected addLabel(option: { where: InsertPosition }): string {
    const at = this.presenter.insertAt(option.where);
    const base =
      option.where === 'start'
        ? $localize`:@@songbooks.addStart:Add to the start`
        : option.where === 'end'
          ? $localize`:@@songbooks.addEnd:Add to the end`
          : option.where === 'above'
            ? $localize`:@@songbooks.addAbove:Add above the selected slot`
            : $localize`:@@songbooks.addBelow:Add below the selected slot`;
    // The position is only knowable while something is selected; without one
    // the button does nothing and there is nothing honest to promise.
    return at === null
      ? base
      : $localize`:@@songbooks.addAt:${base}:action: — lands at ${at + 1}:position:`;
  }

  protected readonly hasSlotSelection = computed(
    () => this.presenter.selectedSlots().size > 0,
  );

  /** Only shown while nothing is ticked — it exists to explain the greyed
   * buttons, and "above" is meaningless without an anchor. */
  protected readonly slotSelectionLabel = $localize`:@@entries.pick:Pick slots to reorder, or to aim Add above/below`;

  protected readonly reorderGroupLabel = $localize`:@@entries.reorder:Reorder`;
  /** "From this songbook" is the load-bearing half of the sentence. */
  protected readonly removeSlotsLabel = $localize`:@@entries.removeSelected:Remove the selected songs from this songbook`;

  /** One chevron is one step, two is all the way — the distinction the labels
   * spell out and the glyphs already carry. */
  protected readonly moveOptions = [
    {
      where: 'start' as const,
      icon: 'moveStart' as const,
      label: $localize`:@@entries.moveStart:Move to the start`,
    },
    {
      where: 'up' as const,
      icon: 'moveUp' as const,
      label: $localize`:@@entries.moveUp:Move up one`,
    },
    {
      where: 'down' as const,
      icon: 'moveDown' as const,
      label: $localize`:@@entries.moveDown:Move down one`,
    },
    {
      where: 'end' as const,
      icon: 'moveEnd' as const,
      label: $localize`:@@entries.moveEnd:Move to the end`,
    },
  ];

  /** "All songs" is never empty for a reason the user can act on; a book you
   * made is. Different facts, different sentences. */
  protected readonly entriesEmptyText = computed(() =>
    this.presenter.isVirtual()
      ? $localize`:@@songs.empty:No songs yet. Create one to get started.`
      : $localize`:@@entries.empty:No songs in this songbook yet.`,
  );

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });

    effect(() => {
      void this.presenter.syncQuery({
        query: this.query(),
        sort: this.sortKey(),
        dir: this.sortDir(),
      });
    });
  }
}
