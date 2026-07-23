// Audience presenter — Epic 9 ▸ subtask 3, 4
// Spec: docs/achordeon-implementation.md §Epic 9; ADR-0003

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  LobbyViewer,
  ParserService,
  RenderService,
} from '@achordeon/shared/data-access';
import type { LobbySummaryRow } from '@achordeon/shared/domain';

const A4_RATIO = 210 / 297;

/**
 * The viewer's render-derived state. Route-scoped (the page provides it) and
 * store-free of anything but the lobby transport: it joins a PIN through
 * `LobbyViewer`, then parses + renders the host's payload **locally** with the
 * same renderer the host used, against the resolved settings the payload carried
 * (ADR-0003). Signals in, commands out (PRD-UI-SHELL.md §3).
 *
 * The summary is read-only here — a viewer follows the performer, it does not
 * jump — so there is no `jumpTo`, only a client-side search filter.
 */
@Injectable()
export class AudiencePresenter {
  private readonly viewer = inject(LobbyViewer);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);

  private readonly _summaryQuery = signal('');
  private readonly _hideChords = signal(false);

  readonly status = this.viewer.status;
  readonly audienceCount = this.viewer.audienceCount;
  readonly payload = this.viewer.payload;

  readonly summaryQuery = this._summaryQuery.asReadonly();
  /** Viewer-local chord hide — reflow-safe (§4.6): the chord rows stay reserved. */
  readonly hideChords = this._hideChords.asReadonly();

  readonly songName = computed(() => this.payload()?.song.name ?? '');
  /** Where the performer stands in the setlist, for the read-only summary mark. */
  readonly currentIndex = computed(() => this.payload()?.currentIndex ?? -1);

  private readonly _plan = computed(() => {
    const p = this.payload();
    if (!p) return null;
    const ast = this.parser.parse(p.song.content);
    return this.renderer.layout(ast, p.settings, {
      hideChords: this._hideChords(),
    });
  });

  readonly svg = computed(() => {
    const plan = this._plan();
    return plan ? this.renderer.emit(plan) : '';
  });

  readonly pageRatio = computed(() => {
    const box = this._plan()?.box;
    return box && box.height > 0 ? box.width / box.height : A4_RATIO;
  });

  readonly summaryRows = computed<readonly LobbySummaryRow[]>(() => {
    const q = this._summaryQuery().toLowerCase();
    const rows = this.payload()?.summary ?? [];
    return rows.filter(
      (row) =>
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q),
    );
  });

  async join(pin: string): Promise<void> {
    await this.viewer.join(pin);
  }

  async leave(): Promise<void> {
    await this.viewer.leave();
  }

  setSummaryQuery(q: string): void {
    this._summaryQuery.set(q);
  }

  toggleHideChords(): void {
    this._hideChords.update((v) => !v);
  }
}
