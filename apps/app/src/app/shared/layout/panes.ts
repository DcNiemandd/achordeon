// Panes — Epic 5 ▸ subtask 6
// Spec: PRD-UI-SHELL.md §4 (the bottom bar carries the pane switcher), §5.1

import { Injectable, signal } from '@angular/core';

/** Which pane a split module is showing when there is only room for one. */
export type ActivePane = 'a' | 'b';

/**
 * What the shell needs to know about the module's split, and nothing more.
 *
 * The **feature owns its split** — it drops `<app-split-pane>` into its own
 * template and fills both sides (PRD-UI-SHELL.md §4) — but the **switcher lives
 * in the shell's bottom bar**, and half the modules have no second pane to switch
 * to. The shell cannot ask "are you split?" of a component it does not know, and
 * the feature cannot reach into the shell's bar. So the split-pane reports the one
 * fact, and the shell renders the control.
 *
 * Deliberately not in `UiStore`: this is derived from what is mounted right now,
 * not a preference. Nothing here is persisted — the active pane's durable home is
 * `?pane=` in the URL (§7), which is where it survives a reload.
 */
@Injectable({ providedIn: 'root' })
export class Panes {
  private readonly _isSplit = signal(false);
  private readonly _active = signal<ActivePane>('a');

  /** True only while a two-pane module is mounted below the breakpoint. */
  readonly isSplit = this._isSplit.asReadonly();
  readonly active = this._active.asReadonly();

  report(isSplit: boolean, active: ActivePane): void {
    this._isSplit.set(isSplit);
    this._active.set(active);
  }

  /** A module without two panes is leaving the shell nothing to switch. */
  clear(): void {
    this._isSplit.set(false);
  }
}
