// Keyboard shortcuts — the armed leader, made visible
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { KeyboardLayout } from './keyboard-layout';
import { describePress } from './key-press';
import { ShortcutRegistry } from './shortcut-registry';

/**
 * "`G` — then where?"
 *
 * A leader chord puts the app into a mode that eats the next keystroke, and an
 * invisible mode is worse than no shortcut at all (ADR-0015). So the moment the
 * leader is armed this appears and says both that something is waiting and what
 * it is waiting for; it goes when the chord completes, when Escape abandons it,
 * or when the window closes on its own.
 *
 * A status message rather than a dialog: nothing here is to be clicked, and the
 * next key is already on its way.
 */
@Component({
  selector: 'app-leader-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[hidden]': '!isArmed()' },
  template: `
    @if (isArmed()) {
      <div class="hint" role="status" data-testid="leader-hint">
        <span class="lead">
          @for (cap of leadCaps(); track $index) {
            <kbd>{{ cap }}</kbd>
          }
        </span>
        @for (option of options(); track option.id) {
          <span class="option">
            <kbd>{{ option.cap }}</kbd>
            <span class="label">{{ option.label }}</span>
          </span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset-block-end: var(--space-3);
      inset-inline: 0;
      z-index: 20;
      display: flex;
      justify-content: center;
      /* It is a message, not a target: a click belongs to whatever it covers. */
      pointer-events: none;
    }

    :host([hidden]) {
      display: none;
    }

    .hint {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-1) var(--space-3);
      max-inline-size: calc(100% - var(--space-4));
      padding: var(--space-1) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-overlay);
      box-shadow: var(--shadow-2);
      font-size: var(--text-sm);
    }

    .lead kbd {
      border-color: var(--brand);
      color: var(--brand);
    }

    .option {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .label {
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
    }
  `,
})
export class LeaderHint {
  private readonly registry = inject(ShortcutRegistry);
  private readonly layout = inject(KeyboardLayout);

  protected readonly isArmed = computed(() => this.registry.leader() !== null);

  protected readonly leadCaps = computed(() => {
    const leader = this.registry.leader();
    return leader ? describePress(leader, this.layout.labels()) : [];
  });

  protected readonly options = computed(() =>
    this.registry.leaderOptions().map((option) => ({
      id: option.action.id,
      label: option.action.label,
      // The second press of a chord never carries a modifier, so one cap is the
      // whole of it.
      cap: describePress(option.press, this.layout.labels()).join('+'),
    })),
  );
}
