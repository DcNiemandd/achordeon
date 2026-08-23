// Audience page — Epic 9 ▸ Audience & lobby
// Spec: docs/achordeon-implementation.md §Epic 9; apps/docs/docs/stage-audience/index.mdx
//
// The viewer half of the follow-along feature. One full-bleed render, a read-only
// summary overlay, and a read-only lobby dialog. The CONTROLS come in the same
// two shapes performing's do, and for the same reasons:
//
// - **A phone** gets AudienceBar (Summary · Fullscreen · More) in the shell's one
//   bottom bar, so there is never a second bar of the feature's stacked on the
//   shell's.
// - **Desktop** gets this page's own top bar, where the ⋯ menu is unwrapped into
//   the row and the transpose stepper stands in the open — there is no shell
//   bottom bar above the breakpoint (the rail takes its place) and there is room.
//
// Both read AudienceSession, so the two bars cannot disagree about state.
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
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import qrcode from 'qrcode-generator';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Tooltip,
} from '../primitives';
import {
  AudienceSession,
  BlankPage,
  DocumentTitle,
  Fullscreen,
  PageZoom,
  TransposeStepper,
  UiStore,
  Viewport,
  ZoomPill,
  turnPageLabel,
} from '../shared/layout';
import { type ShortcutAction, registerShortcuts } from '../shared/keyboard';
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
  imports: [
    BlankPage,
    SongRender,
    Button,
    Dialog,
    EmptyState,
    Field,
    Icon,
    PageZoom,
    Tooltip,
    TransposeStepper,
    ZoomPill,
  ],
  template: `
    <div class="screen">
      <!-- Desktop only: the viewer's own bar, built to the performing bar's
           shape (StagePerformPage) so the two views read alike — the acts
           unwrapped across the row instead of folded behind ⋯, the transpose
           stepper in the open, and the red leave cross in the close position.
           A phone draws nothing here: its controls are <app-audience-bar> in the
           shell's one bottom bar, three thumb targets and a menu.

           No prev/next in the middle, which is the one place the two bars part
           company: the performer drives the song and a viewer follows. -->
      @if (presenter.status() === 'joined' && !viewport.isCompact()) {
        <nav
          class="audience-bar--top"
          [hidden]="!fullscreen.isChromeVisible()"
          [attr.aria-label]="controlsLabel"
          data-testid="audience-page-bar"
        >
          <div class="bar-start">
            <span class="bar-title">{{ presenter.songName() }}</span>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [class.is-active]="session.isSummaryOpen()"
              [attr.aria-pressed]="session.isSummaryOpen()"
              [attr.aria-label]="summaryLabel"
              [appTooltip]="summaryLabel"
              data-testid="audience-summary"
              (click)="session.toggleSummary()"
            >
              <app-icon name="list" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-pressed]="fullscreen.isActive()"
              [attr.aria-label]="fullscreenLabel()"
              [appTooltip]="fullscreenLabel()"
              data-testid="audience-fullscreen"
              (click)="fullscreen.toggle()"
            >
              <app-icon
                [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
              />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [class.is-active]="session.isSongDark()"
              [attr.aria-pressed]="session.isSongDark()"
              [attr.aria-label]="darkPageLabel"
              [appTooltip]="darkPageLabel"
              data-testid="audience-dark-page"
              (click)="session.toggleSongDark()"
            >
              <app-icon name="moon" />
            </button>

            <!-- Turn the page (ADR-0013), on the same terms as the performer's:
                 offered only where a quarter turn would gain this song room, and
                 here on desktop as well as on the phone because "wide layout"
                 and "cannot be turned" are different facts — a tablet held
                 sideways is both. -->
            @if (ui.isPageTurnOffered()) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [class.is-active]="ui.isPageTurnArmed()"
                [attr.aria-pressed]="ui.isPageTurnArmed()"
                [attr.aria-label]="turnPageLabel"
                [appTooltip]="turnPageLabel"
                data-testid="audience-turn-page"
                (click)="ui.togglePageTurn()"
              >
                <span class="stacked-icon">
                  <!-- The device turns with the page: armed, the phone is drawn
                       the quarter round the song will be. -->
                  <app-icon
                    name="smartphone"
                    [class.is-turned]="ui.isPageTurnArmed()"
                  />
                  <app-icon class="badge" name="rotateCcw" />
                </span>
              </button>
            }

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [class.is-active]="session.hideChords()"
              [attr.aria-pressed]="session.hideChords()"
              [attr.aria-label]="hideChordsLabel"
              [appTooltip]="hideChordsLabel"
              data-testid="audience-hide-chords"
              (click)="session.toggleHideChords()"
            >
              <app-icon name="note" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="lobbyLabel"
              [appTooltip]="lobbyLabel"
              data-testid="audience-lobby"
              (click)="session.openLobby()"
            >
              <app-icon name="audience" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="syncLabel"
              [appTooltip]="syncLabel"
              data-testid="audience-sync"
              (click)="session.sync()"
            >
              <app-icon name="reset" />
            </button>

            <!-- Transpose, in the open and last, exactly as performing has it:
                 no ⋯ to hide it behind and the room for the number, so the
                 phone's two taps (menu, sheet) collapse into the control. Last
                 because it is the only thing here that rules itself off, and a
                 ruled group mid-row would cut the loose icons in two. -->
            <app-transpose-stepper
              [value]="session.transpose()"
              (stepped)="session.transposeBy($event)"
              (cleared)="session.resetTranspose()"
            />
          </div>

          <!-- Right: the red leave cross — the songs/songbooks close position,
               and the performer's exit position. -->
          <div class="bar-end-slot">
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              class="btn-exit"
              [attr.aria-label]="leaveLabel"
              [appTooltip]="leaveLabel"
              data-testid="audience-exit"
              (click)="exit()"
            >
              <app-icon name="close" />
            </button>
          </div>
        </nav>
      }

      <!-- PageZoom owns the pointer stream over the page: pinch and wheel to
           magnify, drag to pan, double-tap to toggle — and what is left of a
           single finger comes back as a tap, which is tap-to-reveal. Off while
           there is no page (the PIN prompt renders in here too). -->
      <div
        class="render"
        data-testid="audience-render"
        appPageZoom
        #zoom="appPageZoom"
        [ratio]="presenter.pageRatio()"
        [isEnabled]="view() === 'render'"
        [isTurnArmed]="ui.isPageTurnArmed()"
        (tapped)="fullscreen.reveal()"
      >
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
            <app-blank-page
              [ratio]="presenter.pageRatio()"
              [isPerforming]="true"
              [isDark]="presenter.isDark()"
              [isTurned]="zoom.isTurned()"
              [zoom]="zoom.scale()"
              [panX]="zoom.panX()"
              [panY]="zoom.panY()"
            >
              @if (presenter.svg(); as svg) {
                <app-song-render [svg]="svg" />
              }
            </app-blank-page>
          }
        }
      </div>

      <!-- Viewer-local, like Hide chords and the dark page: the performer never
           sees it and never sends it. Everyone leans in at their own distance. -->
      @if (zoom.isZoomed()) {
        <app-zoom-pill [percent]="zoom.percent()" (cleared)="zoom.reset()" />
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

    /* Desktop top bar — the performing bar's grid with the middle column gone:
       there is no prev/next to centre, so the row is [actions 1fr] [exit auto]
       and the cross still lands hard against the right edge. */
    .audience-bar--top {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      padding: var(--space-1) var(--space-3);
      background: var(--surface-raised);
      border-block-end: 1px solid var(--border);
    }

    .bar-start {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: nowrap;
      min-inline-size: 0;
    }

    .bar-title {
      font-size: var(--text-md);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-inline-end: var(--space-1);
    }

    /* A glyph with a second one badged on it, the way the phone's menu draws
       Turn the page. This bar has no overflow menu, so the same composition has
       to exist here rather than being borrowed from it. */
    .stacked-icon {
      position: relative;
      flex: none;
      display: inline-flex;
      inline-size: 20px;
      block-size: 20px;
    }

    .stacked-icon .badge {
      --icon-size: 14px;
      position: absolute;
      inset-block-start: -1px;
      inset-inline-end: -2px;
      color: var(--brand);
    }

    /* Armed, the phone lies down the quarter turn the song does. The arrow does
       not move — it names the act, which is the same act either way round. */
    .stacked-icon app-icon.is-turned {
      transform: rotate(-90deg);
      transition: transform 150ms ease;
    }

    .bar-end-slot {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }

    /* Red leave button — danger colour, the performing exit's skin. */
    .btn-exit {
      color: var(--danger, #c0362c);
    }

    .btn-exit:hover:not(:disabled) {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
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
      /* .app-field sets inline-size to 100%, and a percentage width does not
         subtract the margins beside it — the field overflowed the panel by
         exactly those two, off the right edge of a phone. Auto hands the
         sizing back to the stretch, which is the one that knows about them. */
      inline-size: auto;
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
  /** Read for `isPageTurnArmed` only — the same flag Stage reads, because it is
   * a fact about this device rather than about either seat. */
  protected readonly ui = inject(UiStore);
  private readonly router = inject(Router);

  /** `/audience/:pin`, absent on the bare `/audience` route. */
  readonly pin = input<string>('');

  /** The page's own zoom — for the keys, and for dropping it when the performer
   * moves on. Not `required`: the template reads it before the query resolves. */
  private readonly zoom = viewChild(PageZoom);

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
    registerShortcuts({
      name: this.watchingLabel,
      actions: this.watchingShortcuts,
    });
    registerShortcuts({
      name: this.summaryLabel,
      isBlocking: this.session.isSummaryOpen,
      actions: this.summaryShortcuts,
    });

    // The shell-side bar cannot reach the presenter (data-access); it asks the
    // session to leave or re-sync, which runs these.
    this.session.registerLeave(() => this.exit());
    this.session.registerSync(() => void this.presenter.sync());

    // The tab names the act, the way performing does — but only while there is a
    // performance to be watching. The PIN prompt is the Audience *module*, so the
    // claim goes empty there and `DocumentTitle` falls back to the module title;
    // that fallback is exactly what it is for.
    inject(DestroyRef).onDestroy(
      inject(DocumentTitle).claim(() =>
        this.view() === 'render' ? this.watchingTitle : '',
      ),
    );

    inject(DestroyRef).onDestroy(() => {
      void this.presenter.leave();
      void this.fullscreen.exit();
      this.session.setMounted(false);
      this.session.reset();
      this.ui.setPageTurnOffered(false);
    });

    // Whether a quarter turn would gain this song anything, told to the shell so
    // AudienceBar can offer the toggle (ADR-0013). A viewer needs it more than a
    // performer does: they never chose this song's shape, and it arrived from
    // somebody else's screen.
    effect(() => {
      this.ui.setPageTurnOffered(this.zoom()?.isTurnWorthwhile() ?? false);
    });

    // Join whenever the routed PIN changes; a bare /audience leaves us idle.
    effect(() => {
      const pin = this.pin();
      if (pin) void this.presenter.join(pin.toUpperCase());
    });

    // The shell draws the audience bar only while a viewer is joined.
    effect(() => this.session.setMounted(this.presenter.status() === 'joined'));

    // The performer moved on: a new song is a new page, and a magnification held
    // over from the last one would frame the middle of nothing. Same rule as
    // performing — and here it is the only way out that arrives on its own, since
    // a viewer has no prev/next to press.
    effect(() => {
      this.presenter.currentIndex();
      this.zoom()?.reset();
    });

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

  /** Says which way the button goes, the way AudienceBar's does. */
  protected fullscreenLabel(): string {
    return this.fullscreen.isActive()
      ? this.exitFullscreenLabel
      : this.enterFullscreenLabel;
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

  /**
   * Watching from the keyboard (ADR-0015) — **the same keys as performing**, and
   * only the zoom: a viewer does not turn the page, the performer does.
   *
   * `0` is the reliable reset. Escape is offered alongside it, but only while
   * something is magnified: a disabled action leaves the press to the browser,
   * and in fullscreen Escape is how you get out of fullscreen.
   */
  private readonly watchingShortcuts = computed<readonly ShortcutAction[]>(
    () => {
      const zoom = this.zoom();
      return [
        {
          id: 'audience.zoomIn',
          label: this.zoomInLabel,
          keys: ['+', '='],
          run: () => zoom?.zoomIn(),
        },
        {
          id: 'audience.zoomOut',
          label: this.zoomOutLabel,
          keys: ['-'],
          run: () => zoom?.zoomOut(),
        },
        {
          id: 'audience.resetZoom',
          label: this.resetZoomLabel,
          keys: ['0', 'Escape'],
          isDisabled: !(zoom?.isZoomed() ?? false),
          run: () => zoom?.reset(),
        },
      ];
    },
  );

  /** The song list, while it is open: it takes every key and gives back the one
   * that closes it — the perform view's arrangement, for the same panel. */
  private readonly summaryShortcuts = computed<readonly ShortcutAction[]>(() =>
    this.session.isSummaryOpen()
      ? [
          {
            id: 'audience.closeSummary',
            label: this.closeLabel,
            keys: ['Escape'],
            run: () => this.session.closeSummary(),
          },
        ]
      : [],
  );

  /** What the browser tab says while following a lobby: "Watching - Achordeon". */
  private readonly watchingTitle = $localize`:@@audience.documentTitle:Watching`;

  protected readonly joinHeading = $localize`:@@audience.joinHeading:Join an audience`;
  protected readonly joinHint = $localize`:@@audience.joinHint:Enter the PIN the performer is showing, or scan their QR code.`;
  protected readonly pinPlaceholder = $localize`:@@audience.pinPlaceholder:PIN`;
  protected readonly joinLabel = $localize`:@@audience.join:Join`;
  protected readonly connectingText = $localize`:@@audience.connecting:Connecting to the lobby…`;
  protected readonly notFoundText = $localize`:@@audience.notFound:No lobby found for that PIN. Check it and try again.`;
  protected readonly endedText = $localize`:@@audience.ended:The performer ended the lobby.`;
  protected readonly unavailableText = $localize`:@@audience.unavailable:Audiences are unavailable right now.`;

  protected readonly summaryLabel = $localize`:@@audience.summary:Song list`;
  /** Names this screen's group in the shortcuts dialog. */
  protected readonly watchingLabel = $localize`:@@audience.watching:Watching`;
  protected readonly zoomInLabel = $localize`:@@stage.zoomIn:Zoom in`;
  protected readonly zoomOutLabel = $localize`:@@stage.zoomOut:Zoom out`;
  protected readonly resetZoomLabel = $localize`:@@stage.resetZoom:Reset zoom`;
  protected readonly summaryHeading = $localize`:@@stage.summaryHeading:Songs`;
  protected readonly closeLabel = $localize`:@@audience.close:Close`;
  protected readonly searchPlaceholder = $localize`:@@stage.search:Search…`;
  protected readonly noMatchText = $localize`:@@stage.noMatch:No songs match your search.`;

  // The desktop bar's own words. Every one is an id AudienceBar already carries,
  // deliberately: the two bars are the same acts at two widths, and a second
  // string for "Leave audience" would be a second thing to translate and a
  // second thing to get out of step.
  protected readonly controlsLabel = $localize`:@@audience.controls:Audience controls`;
  protected readonly darkPageLabel = $localize`:@@stage.darkPage:Dark page`;
  protected readonly hideChordsLabel = $localize`:@@audience.hideChords:Hide chords`;
  protected readonly syncLabel = $localize`:@@audience.sync:Re-sync`;
  protected readonly leaveLabel = $localize`:@@audience.exit:Leave audience`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
  protected readonly turnPageLabel = turnPageLabel;

  protected readonly lobbyLabel = $localize`:@@audience.lobby:Lobby`;
  protected readonly pinLabel = $localize`:@@stage.audienceDialog.pin:PIN`;
  protected readonly countLabel = $localize`:@@stage.audienceDialog.count:Listening`;
  protected readonly qrLabel = $localize`:@@stage.audienceDialog.qr:QR code`;
}
