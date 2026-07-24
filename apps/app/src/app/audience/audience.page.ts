// Audience page — Epic 9 ▸ Audience & lobby
// Spec: docs/achordeon-implementation.md §Epic 9; apps/docs/docs/stage-audience/index.mdx
//
// The viewer half of the follow-along feature. One full-bleed render, a read-only
// summary overlay, and a read-only lobby dialog. The CONTROLS are AudienceBar
// (Summary · Fullscreen · More), which — exactly like the performing controls —
// lives in the shell's one bottom bar on a phone (so there is never a second
// bar) and is mounted here at the foot only on desktop. Both read AudienceSession.
//
// Join by PIN (typed) or the QR deep link `/audience/:pin`; the payload carries
// the full Song + resolved settings, so this render matches the host's byte for
// byte (ADR-0003).

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import qrcode from 'qrcode-generator';
import { Button, Dialog, EmptyState, Field, Icon } from '../primitives';
import {
  AudienceBar,
  AudienceSession,
  BlankPage,
  Fullscreen,
  Viewport,
} from '../shared/layout';
import { SongRender } from '../shared/song-render';
import { AudiencePresenter } from './audience.presenter';

/** localStorage key for the last PIN that successfully connected. */
const LAST_PIN_KEY = 'achordeon.audience.lastPin';

function readLastPin(): string {
  try {
    return localStorage.getItem(LAST_PIN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLastPin(pin: string): void {
  try {
    localStorage.setItem(LAST_PIN_KEY, pin);
  } catch {
    // Storage unavailable (private mode / quota) — prefill is a nicety, skip it.
  }
}

@Component({
  selector: 'app-audience-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AudiencePresenter],
  host: { '(document:keydown)': 'onKeyDown($event)' },
  imports: [
    BlankPage,
    SongRender,
    AudienceBar,
    Button,
    Dialog,
    EmptyState,
    Field,
    Icon,
  ],
  template: `
    <div class="screen" (pointerup)="onPointerUp($event)">
      <div class="render" data-testid="audience-render">
        @switch (view()) {
          @case ('entry') {
            <!-- No PIN yet, or the joined lobby went away: ask for a PIN. -->
            <form
              class="join"
              (submit)="submitPin($event)"
              data-testid="audience-join"
            >
              <h2 class="join-title">{{ joinHeading }}</h2>
              <p class="join-hint">{{ joinHint }}</p>
              @if (presenter.status() === 'not-found') {
                <p class="join-error" data-testid="audience-not-found">
                  <app-icon name="warning" />
                  {{ notFoundText }}
                </p>
              }
              @if (presenter.status() === 'ended') {
                <p class="join-error" data-testid="audience-ended">
                  {{ endedText }}
                </p>
              }
              @if (presenter.status() === 'unavailable') {
                <p class="join-error" data-testid="audience-unavailable">
                  {{ unavailableText }}
                </p>
              }
              <input
                appField
                class="join-input"
                [placeholder]="pinPlaceholder"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                [value]="pinDraft()"
                data-testid="audience-pin-input"
                (input)="onPinInput($event)"
              />
              <button
                appButton
                type="submit"
                variant="primary"
                [disabled]="pinDraft().length === 0"
                data-testid="audience-join-submit"
              >
                {{ joinLabel }}
              </button>
            </form>
          }
          @case ('connecting') {
            <app-empty-state
              [text]="connectingText"
              data-testid="audience-connecting"
            />
          }
          @case ('render') {
            <app-blank-page [ratio]="presenter.pageRatio()">
              @if (presenter.svg(); as svg) {
                <app-song-render [svg]="svg" />
              }
            </app-blank-page>
          }
        }
      </div>

      <!-- Desktop: the controls sit at the foot of the page (there is no shell
           bottom bar above the breakpoint — the rail takes its place). On a phone
           this is absent and the shell mounts <app-audience-bar> in its one bar. -->
      @if (presenter.status() === 'joined' && !viewport.isCompact()) {
        <div
          class="page-bar"
          [hidden]="!fullscreen.isChromeVisible()"
          data-testid="audience-page-bar"
        >
          <app-audience-bar />
        </div>
      }

      <!-- Read-only summary: search + list, no jump. The current song is marked;
           a viewer follows, it does not choose. -->
      @if (session.isSummaryOpen()) {
        <div
          class="summary"
          role="dialog"
          [attr.aria-label]="summaryLabel"
          data-testid="audience-summary-panel"
        >
          <div class="summary-head">
            <h2 class="summary-title">{{ summaryHeading }}</h2>
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="closeLabel"
              (click)="session.closeSummary()"
            >
              <app-icon name="close" />
            </button>
          </div>

          <input
            appField
            type="search"
            class="summary-search"
            [placeholder]="searchPlaceholder"
            [value]="presenter.summaryQuery()"
            data-testid="audience-summary-search"
            (input)="onSummarySearch($event)"
          />

          <ul class="summary-list" data-testid="audience-summary-list">
            @for (row of presenter.summaryRows(); track row.index) {
              <li
                class="summary-row"
                [class.is-current]="row.index === presenter.currentIndex()"
                [attr.data-testid]="'audience-summary-row-' + row.index"
              >
                <span class="summary-num">{{ row.index + 1 }}</span>
                <span class="summary-info">
                  <span class="summary-name">{{ row.name }}</span>
                  @if (row.title) {
                    <span class="summary-sub">{{ row.title }}</span>
                  }
                </span>
              </li>
            }
            @if (presenter.summaryRows().length === 0) {
              <li class="summary-empty">{{ noMatchText }}</li>
            }
          </ul>
        </div>
      }

      <!-- Read-only lobby dialog: PIN + QR (share with a neighbour) + count.
           Viewport mode so a backdrop click closes it. -->
      @if (session.isLobbyOpen()) {
        <app-dialog
          [title]="lobbyLabel"
          mode="viewport"
          data-testid="audience-lobby-dialog"
          (closed)="session.closeLobby()"
        >
          <dl class="lobby-info">
            <dt>{{ pinLabel }}</dt>
            <dd class="lobby-pin" data-testid="audience-lobby-pin">
              {{ pin() }}
            </dd>
            <dt>{{ countLabel }}</dt>
            <dd data-testid="audience-lobby-count">
              {{ presenter.audienceCount() }}
            </dd>
            <dt>{{ qrLabel }}</dt>
            <dd class="lobby-qr">
              <img class="qr" [src]="qrDataUrl()" [alt]="qrLabel" />
            </dd>
          </dl>
        </app-dialog>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .screen {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      position: relative;
      overflow: hidden;
      user-select: none;
    }

    .render {
      flex: 1;
      min-block-size: 0;
    }

    /* Desktop foot bar — a full-width strip that AudienceBar (flex: 1) fills. */
    .page-bar {
      display: flex;
      padding: 2px;
      background: var(--surface-raised);
      border-block-start: 1px solid var(--border);
    }

    /* Join form — centered card in the render area. */
    .join {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-inline-size: 320px;
      margin: var(--space-6) auto 0;
      padding: 0 var(--space-4);
      text-align: center;
    }

    .join-title {
      margin: 0;
      font-size: var(--text-lg);
    }

    .join-hint {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }

    .join-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      margin: 0;
      color: var(--danger, #c0362c);
      font-size: var(--text-sm);
    }

    .join-error app-icon {
      --icon-size: 16px;
    }

    .join-input {
      text-align: center;
      font-size: var(--text-xl);
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    /* Summary panel — overlays from the right, same shape as performing. */
    .summary {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      inline-size: min(340px, 80cqi);
      display: flex;
      flex-direction: column;
      background: var(--surface-raised);
      border-inline-start: 1px solid var(--border);
      box-shadow: var(--shadow-2);
      z-index: 10;
    }

    .summary-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    .summary-title {
      flex: 1;
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 500;
    }

    .summary-search {
      margin: var(--space-2) var(--space-3);
    }

    .summary-list {
      flex: 1;
      min-block-size: 0;
      overflow-y: auto;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .summary-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
    }

    .summary-row.is-current {
      background: var(--brand-subtle);
      color: var(--brand);
      font-weight: 500;
    }

    .summary-num {
      flex: none;
      min-inline-size: 2ch;
      font-size: var(--text-xs);
      color: var(--text-faint);
      text-align: end;
    }

    .summary-row.is-current .summary-num {
      color: inherit;
    }

    .summary-info {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .summary-name {
      font-size: var(--text-sm);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-sub {
      font-size: var(--text-xs);
      color: var(--text-faint);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-empty {
      padding: var(--space-3);
      font-size: var(--text-sm);
      color: var(--text-faint);
    }

    /* Lobby dialog */
    .lobby-info {
      margin: 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-4) var(--space-3);
      align-items: baseline;
      font-size: var(--text-sm);
      user-select: text;
    }

    .lobby-info dt {
      color: var(--text-muted);
      font-weight: 500;
    }

    .lobby-info dd {
      margin: 0;
    }

    .lobby-pin {
      font-size: var(--text-xl);
      font-weight: 700;
      letter-spacing: 0.15em;
    }

    .lobby-qr {
      display: flex;
    }

    .qr {
      inline-size: 200px;
      block-size: 200px;
      background: #fff;
      border-radius: var(--radius-md);
      image-rendering: pixelated;
    }
  `,
})
export class AudiencePage {
  protected readonly presenter = inject(AudiencePresenter);
  protected readonly fullscreen = inject(Fullscreen);
  protected readonly session = inject(AudienceSession);
  protected readonly viewport = inject(Viewport);
  private readonly router = inject(Router);

  /** `/audience/:pin`, absent on the bare `/audience` route. */
  readonly pin = input<string>('');

  // Prefilled with the last PIN that actually connected, so re-joining is one
  // tap. Persisted in localStorage on a successful join (see the effect below).
  protected readonly pinDraft = signal(readLastPin());

  /**
   * Which body to draw. `entry` covers "no PIN", "wrong PIN", "lobby ended" and
   * "unavailable" — all cases where the answer is to (re)enter a PIN. A live
   * lobby renders; the gap between subscribe and first sync is `connecting`.
   */
  protected readonly view = computed<'entry' | 'connecting' | 'render'>(() => {
    if (!this.pin()) return 'entry';
    switch (this.presenter.status()) {
      case 'joined':
        return 'render';
      case 'connecting':
        return 'connecting';
      default:
        return 'entry';
    }
  });

  /** The current lobby link as a QR, so a viewer can pass it to a neighbour. */
  protected readonly qrDataUrl = computed(() => {
    if (!this.pin()) return '';
    const qr = qrcode(0, 'M');
    qr.addData(
      typeof location !== 'undefined'
        ? location.href
        : `/audience/${this.pin()}`,
    );
    qr.make();
    return qr.createDataURL(6, 2);
  });

  constructor() {
    // The shell-side bar cannot reach the presenter (data-access); it asks the
    // session to leave or re-sync, which runs these.
    this.session.registerLeave(() => this.exit());
    this.session.registerSync(() => void this.presenter.sync());

    inject(DestroyRef).onDestroy(() => {
      void this.presenter.leave();
      void this.fullscreen.exit();
      this.session.setMounted(false);
      this.session.reset();
    });

    // Join whenever the routed PIN changes; a bare /audience leaves us idle.
    effect(() => {
      const pin = this.pin();
      if (pin) void this.presenter.join(pin.toUpperCase());
    });

    // The shell draws the audience bar only while a viewer is joined.
    effect(() => this.session.setMounted(this.presenter.status() === 'joined'));

    // Remember a PIN once it actually connects — that is the one worth
    // prefilling next time (a mistyped PIN never reaches 'joined').
    effect(() => {
      if (this.presenter.status() === 'joined' && this.pin()) {
        writeLastPin(this.pin().toUpperCase());
      }
    });
  }

  /** Leave the lobby: stop following, drop fullscreen, back to the PIN prompt. */
  protected exit(): void {
    void this.presenter.leave();
    void this.fullscreen.exit();
    this.session.reset();
    // Prefill the prompt with the PIN just left, so rejoining is one tap.
    this.pinDraft.set(readLastPin());
    void this.router.navigate(['/audience']);
  }

  /** In fullscreen, a tap reveals the chrome (no dedicated zone — like Stage). */
  protected onPointerUp(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.summary, button, a, input'))
      return;
    this.fullscreen.reveal();
  }

  protected onPinInput(event: Event): void {
    this.pinDraft.set((event.target as HTMLInputElement).value.toUpperCase());
  }

  protected submitPin(event: Event): void {
    event.preventDefault();
    const pin = this.pinDraft().trim().toUpperCase();
    if (pin === '') return;
    void this.router.navigate(['/audience', pin]);
  }

  protected onSummarySearch(event: Event): void {
    this.presenter.setSummaryQuery((event.target as HTMLInputElement).value);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.session.isSummaryOpen()) {
      event.preventDefault();
      this.session.closeSummary();
    }
  }

  protected readonly joinHeading = $localize`:@@audience.joinHeading:Join an audience`;
  protected readonly joinHint = $localize`:@@audience.joinHint:Enter the PIN the performer is showing, or scan their QR code.`;
  protected readonly pinPlaceholder = $localize`:@@audience.pinPlaceholder:PIN`;
  protected readonly joinLabel = $localize`:@@audience.join:Join`;
  protected readonly connectingText = $localize`:@@audience.connecting:Connecting to the lobby…`;
  protected readonly notFoundText = $localize`:@@audience.notFound:No lobby found for that PIN. Check it and try again.`;
  protected readonly endedText = $localize`:@@audience.ended:The performer ended the lobby.`;
  protected readonly unavailableText = $localize`:@@audience.unavailable:Audiences are unavailable right now.`;

  protected readonly summaryLabel = $localize`:@@audience.summary:Song list`;
  protected readonly summaryHeading = $localize`:@@stage.summaryHeading:Songs`;
  protected readonly closeLabel = $localize`:@@audience.close:Close`;
  protected readonly searchPlaceholder = $localize`:@@stage.search:Search…`;
  protected readonly noMatchText = $localize`:@@stage.noMatch:No songs match your search.`;

  protected readonly lobbyLabel = $localize`:@@audience.lobby:Lobby`;
  protected readonly pinLabel = $localize`:@@stage.audienceDialog.pin:PIN`;
  protected readonly countLabel = $localize`:@@stage.audienceDialog.count:Listening`;
  protected readonly qrLabel = $localize`:@@stage.audienceDialog.qr:QR code`;
}
