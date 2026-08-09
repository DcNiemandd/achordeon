// Keyboard shortcuts — the list, opened with `?`
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md;
//       CONTEXT.md §Keyboard shortcut

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Dialog } from '../../primitives';
import { KeyboardLayout } from './keyboard-layout';
import { describeShortcut } from './key-press';
import { registerShortcuts } from './register-shortcuts';
import { ShortcutRegistry } from './shortcut-registry';

/**
 * Every shortcut that is live right now, grouped by the screen that offers it,
 * **this screen first**.
 *
 * It is the authoritative map (CONTEXT.md §Keyboard shortcut): the documentation
 * teaches the two kinds of shortcut and points here rather than listing them, so
 * a page nobody regenerates can no longer promise a key that does not exist.
 *
 * It reads the same registry the keys are dispatched from, so a greyed-out
 * action is greyed out here too, and a key that has just been registered by a
 * dialog appears without anybody remembering to add it.
 */
@Component({
  selector: 'app-shortcuts-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <app-dialog
      [title]="heading"
      size="large"
      data-testid="shortcuts-dialog"
      (closed)="closed.emit()"
    >
      @for (group of groups(); track group.name) {
        <section class="group">
          <h3 class="group-name">{{ group.name }}</h3>
          <dl class="rows">
            @for (row of group.rows; track row.id) {
              <div class="row" [class.is-disabled]="row.isDisabled">
                <dt class="label">{{ row.label }}</dt>
                <dd class="keys">
                  @for (chord of row.keys; track $index) {
                    @if (!$first) {
                      <span class="or">{{ orText }}</span>
                    }
                    <span class="chord">
                      @for (press of chord; track $index) {
                        @if (!$first) {
                          <span class="then">{{ thenText }}</span>
                        }
                        <span class="press">
                          @for (cap of press; track $index) {
                            @if (!$first) {
                              <span class="plus">+</span>
                            }
                            <kbd>{{ cap }}</kbd>
                          }
                        </span>
                      }
                    </span>
                  }
                </dd>
              </div>
            }
          </dl>
        </section>
      }
    </app-dialog>
  `,
  styles: `
    .group + .group {
      margin-block-start: var(--space-3);
    }

    .group-name {
      margin: 0 0 var(--space-1);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .rows {
      margin: 0;
    }

    /* Name on the left, keys on the right — the shape every application's list
       of shortcuts has, and the one people scan by the key rather than read. */
    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      padding-block: 4px;
      border-block-end: 1px solid var(--border-subtle, var(--border));
    }

    .row:last-child {
      border-block-end: none;
    }

    /* Greyed out here for the same reason the button is: the key is real, and
       right now there is nothing for it to act on. */
    .row.is-disabled {
      color: var(--text-faint);
    }

    .label {
      min-inline-size: 0;
      font-size: var(--text-sm);
    }

    .keys {
      margin: 0;
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .chord,
    .press {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .or,
    .then {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .plus {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    kbd {
      min-inline-size: 20px;
      padding: 1px 5px;
      border: 1px solid var(--border);
      border-block-end-width: 2px;
      border-radius: var(--radius-sm);
      background: var(--surface);
      font-family: inherit;
      font-size: var(--text-xs);
      text-align: center;
      white-space: nowrap;
    }
  `,
})
export class ShortcutsDialog {
  private readonly registry = inject(ShortcutRegistry);
  private readonly layout = inject(KeyboardLayout);

  readonly closed = output<void>();

  protected readonly heading = $localize`:@@shortcuts.title:Keyboard shortcuts`;
  /** Between two keys that do the same thing. */
  protected readonly orText = $localize`:@@shortcuts.or:or`;
  /** Between the two presses of a leader chord: `G` **then** `S`. */
  protected readonly thenText = $localize`:@@shortcuts.then:then`;

  protected readonly groups = computed(() => {
    const labels = this.layout.labels();
    return this.registry
      .layers()
      .map((layer) => ({
        name: layer.name,
        rows: layer
          .actions()
          .filter((action) => !action.isHidden && action.keys.length > 0)
          .map((action) => ({
            id: action.id,
            label: action.label,
            isDisabled: action.isDisabled === true,
            keys: action.keys.map((key) => describeShortcut(key, labels)),
          })),
      }))
      .filter((group) => group.rows.length > 0);
  });

  constructor() {
    // On top of everything it is listing, so nothing underneath acts on a key
    // pressed while the user is reading about it. Its own Escape is hidden:
    // "Close — Esc" in a list of shortcuts is a row about the list.
    registerShortcuts({
      name: this.heading,
      isBlocking: true,
      actions: signal([
        {
          id: 'shortcuts.close',
          label: this.heading,
          keys: ['Escape'],
          isHidden: true,
          run: () => this.closed.emit(),
        },
      ]),
    });
  }
}
