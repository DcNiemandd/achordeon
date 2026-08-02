// The "report a problem" dialog.
//
// Achordeon used to answer "found a bug?" with a link to GitHub, which asks a
// musician mid-rehearsal to open a browser, hold an account on a developer site,
// and describe a build they have no way of naming. This is the same report, filed
// from where the bug is: three fields, and an offer to attach the two things that
// would otherwise have to be described in prose — which app this is, and which song
// it went wrong on.
//
// **Presentational.** It gathers a draft and emits it; the presenter of whichever
// screen hosts it does the sending and owns the outcome (PRD-UI-SHELL.md §3). The
// one thing it reaches for on its own is `FeedbackContext`, which is a shell
// registry rather than a store — it holds no data, only a description of what the
// screen underneath is showing.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import { FeedbackContext } from './feedback-context';
import { collectDiagnostics } from './feedback-diagnostics';
import type { FeedbackDraft, FeedbackKind } from './feedback-model';

/** Shorter than this is not a report, it is a shrug. Mirrors the endpoint's own
 * minimum, so the refusal happens here — where it can be a hint and not an error. */
const MESSAGE_MIN = 10;

@Component({
  selector: 'app-feedback-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog, Button],
  template: `
    <app-dialog
      [title]="title"
      data-testid="feedback-dialog"
      (closed)="closed.emit()"
    >
      <div class="form">
        <label class="row">
          <span class="name">{{ kindLabel }}</span>
          <select
            class="control"
            [value]="kind()"
            data-testid="feedback-kind"
            (change)="setKind($event)"
          >
            <option value="bug">{{ bugOption }}</option>
            <option value="idea">{{ ideaOption }}</option>
            <option value="other">{{ otherOption }}</option>
          </select>
        </label>

        <label class="stack">
          <span class="name">{{ messageLabel }}</span>
          <textarea
            #body
            class="text-area"
            rows="6"
            [value]="message()"
            [placeholder]="messagePlaceholder"
            data-testid="feedback-message"
            (input)="message.set(body.value)"
          ></textarea>
        </label>
        <!-- The rule, not a platitude. Send is held down until this is met, and a
             disabled button with no stated reason is the whole complaint: it
             names the minimum, and turns into a warning once there is something
             in the box that does not meet it. -->
        @if (!isLongEnough()) {
          <p
            class="hint"
            [class.warn]="message().length > 0"
            data-testid="feedback-message-hint"
          >
            {{ messageHint }}
          </p>
        }

        <label class="stack">
          <span class="name">{{ contactLabel }}</span>
          <input
            #reply
            class="text-input"
            type="email"
            autocomplete="email"
            [value]="contactValue()"
            data-testid="feedback-contact"
            (input)="contactValue.set(reply.value)"
          />
        </label>
        <p class="hint">{{ contactHint }}</p>

        <label class="toggle">
          <input
            type="checkbox"
            [checked]="sendsApp()"
            data-testid="feedback-send-app"
            (change)="sendsApp.set(checked($event))"
          />
          <span class="name">{{ appDataLabel }}</span>
        </label>
        <p class="hint">{{ appDataHint }}</p>

        <!-- Only when a screen declared one recently. Someone who opened Settings
             from a cold start has nothing to attach, and an offer to attach
             nothing is noise. -->
        @if (subject(); as it) {
          <label class="toggle">
            <input
              type="checkbox"
              [checked]="sendsSubject()"
              data-testid="feedback-send-subject"
              (change)="toggleSubject(checked($event))"
            />
            <span class="name">{{
              it.kind === 'song' ? songLabel : songbookLabel
            }}</span>
          </label>
          <p class="hint">
            {{ isLoadingSubject() ? attachingLabel : it.name }}
          </p>
          <p class="hint">{{ attachHint }}</p>
        }

        <!-- Closed by default, and it is the whole consent story: the boxes above
             say what KIND of thing travels, this says exactly what does. Nobody
             has to take the hint text on faith. -->
        @if (payload(); as attached) {
          <details class="preview">
            <summary data-testid="feedback-preview">{{ previewLabel }}</summary>
            <pre class="json">{{ pretty(attached) }}</pre>
          </details>
        }

        @if (error() !== null) {
          <p class="warn" data-testid="feedback-error">{{ error() }}</p>
        }
      </div>

      <button
        dialog-actions
        appButton
        type="button"
        variant="ghost"
        data-testid="feedback-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="feedback-submit"
        [disabled]="!canSend()"
        (click)="submit()"
      >
        {{ isBusy() ? sendingLabel : sendLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--space-2);
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .toggle {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      justify-items: start;
      gap: var(--space-2);
    }

    .name {
      color: var(--text);
    }

    .control,
    .text-input,
    .text-area {
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    .text-area {
      resize: vertical;
      /* The one field that is the report. Everything else is metadata. */
      min-block-size: 6lh;
    }

    .hint {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .preview summary {
      cursor: pointer;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .json {
      max-block-size: 14lh;
      margin: var(--space-1) 0 0;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--surface-sunken, var(--surface));
      font-family: var(--font-mono, monospace);
      font-size: var(--text-xs);
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
    }

    .warn {
      margin: 0;
      color: var(--danger);
      font-size: var(--text-xs);
    }
  `,
})
export class FeedbackDialog {
  private readonly context = inject(FeedbackContext);

  /** A send is in flight — the button says so and stands down. */
  readonly isBusy = input(false);
  /** The host's word for how the last attempt failed, or null. */
  readonly error = input<string | null>(null);
  /** The signed-in reporter's address, to save them typing it. Null when signed
   * out, which is most sessions — the field is optional either way. */
  readonly knownContact = input<string | null>(null);

  readonly submitted = output<FeedbackDraft>();
  readonly closed = output<void>();

  /**
   * Snapshotted on open, not tracked.
   *
   * What is on offer must not change while the reporter is typing about it — and
   * the offer is "the song you were working on" anyway, which stopped being a
   * live fact the moment they walked to Settings (`FeedbackContext.current`).
   */
  protected readonly subject = signal(this.context.current());

  protected readonly kind = signal<FeedbackKind>('bug');
  protected readonly message = signal('');
  /** Seeded from the account, then the reporter's to change — `linkedSignal` so a
   * sign-in that resolves while the dialog is open still fills an untouched field. */
  protected readonly contactValue = linkedSignal(
    () => this.knownContact() ?? '',
  );

  /**
   * Ticked by default, and only this one.
   *
   * It carries the build, the browser and the window — facts about the software,
   * not about the person, and the difference between a report that can be acted on
   * and one that starts with three questions. The song below it stays unticked,
   * because that is the reporter's own writing and a default has no business
   * volunteering it.
   */
  protected readonly sendsApp = signal(true);
  protected readonly sendsSubject = signal(false);

  /** The resolved attachment, once the box has been ticked. Kept after an untick
   * so a change of mind does not re-read the record. */
  private readonly subjectData = signal<Record<string, unknown> | null>(null);
  protected readonly isLoadingSubject = signal(false);

  protected readonly isLongEnough = computed(
    () => this.message().trim().length >= MESSAGE_MIN,
  );
  /** Held down while the attachment is being read, so a fast sender cannot post
   * a report whose song was still loading — which would arrive silently without
   * the very thing they ticked the box for. */
  protected readonly canSend = computed(
    () => this.isLongEnough() && !this.isBusy() && !this.isLoadingSubject(),
  );

  /**
   * Tick, and fetch what was ticked.
   *
   * The read happens here rather than on send so the preview can show it: the box
   * says "attach the song", and the only way to see what that actually means is
   * for the thing to be in hand before the report goes.
   */
  protected toggleSubject(isOn: boolean): void {
    this.sendsSubject.set(isOn);
    if (!isOn || this.subjectData() !== null || this.isLoadingSubject()) return;

    const subject = this.subject();
    if (subject === null) return;

    this.isLoadingSubject.set(true);
    void subject
      .snapshot()
      .then((data) => this.subjectData.set(data))
      .catch(() => {
        // Unreadable record: untick rather than attach nothing under a ticked
        // box, which would promise the maintainer a song that never arrives.
        this.sendsSubject.set(false);
      })
      .finally(() => this.isLoadingSubject.set(false));
  }

  /** Exactly what will travel, or null if both boxes are clear. Recomputed as the
   * boxes move, which is what makes the preview honest. */
  protected readonly payload = computed<Record<string, unknown> | null>(() => {
    const parts: Record<string, unknown> = {};
    if (this.sendsApp()) Object.assign(parts, collectDiagnostics());

    const subject = this.subject();
    const attached = this.subjectData();
    if (subject && attached && this.sendsSubject()) {
      parts[subject.kind] = { name: subject.name, ...attached };
    }

    return Object.keys(parts).length === 0 ? null : parts;
  });

  protected pretty(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, null, 2);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected setKind(event: Event): void {
    this.kind.set((event.target as HTMLSelectElement).value as FeedbackKind);
  }

  protected submit(): void {
    if (!this.canSend()) return;
    const contact = this.contactValue().trim();
    this.submitted.emit({
      kind: this.kind(),
      message: this.message().trim(),
      contact: contact === '' ? null : contact,
      payload: this.payload(),
    });
  }

  protected readonly title = $localize`:@@feedback.title:Report a problem`;
  protected readonly kindLabel = $localize`:@@feedback.kind:This is`;
  protected readonly bugOption = $localize`:@@feedback.kind.bug:A bug`;
  protected readonly ideaOption = $localize`:@@feedback.kind.idea:An idea`;
  protected readonly otherOption = $localize`:@@feedback.kind.other:Something else`;
  protected readonly messageLabel = $localize`:@@feedback.message:What happened?`;
  protected readonly messagePlaceholder = $localize`:@@feedback.messagePlaceholder:What you did, and what happened instead.`;
  protected readonly messageHint = $localize`:@@feedback.messageHint:At least 10 characters — enough to say what happened.`;
  protected readonly contactLabel = $localize`:@@feedback.contact:Email (optional)`;
  protected readonly contactHint = $localize`:@@feedback.contactHint:Only so I can write back. Leave it blank and the report stays anonymous.`;
  protected readonly appDataLabel = $localize`:@@feedback.appData:Send app data`;
  protected readonly appDataHint = $localize`:@@feedback.appDataHint:Version, browser, language and window size. No songs, no account, nothing else.`;
  protected readonly attachHint = $localize`:@@feedback.attachHint:The same file the Export button writes, plus your render defaults — so the problem can be reproduced exactly.`;
  protected readonly attachingLabel = $localize`:@@feedback.attaching:Reading it…`;
  protected readonly songLabel = $localize`:@@feedback.attachSong:Attach the song you were working on`;
  protected readonly songbookLabel = $localize`:@@feedback.attachSongbook:Attach the songbook you were working on`;
  protected readonly previewLabel = $localize`:@@feedback.preview:See exactly what is sent`;
  protected readonly cancelLabel = $localize`:@@feedback.cancel:Cancel`;
  protected readonly sendLabel = $localize`:@@feedback.send:Send`;
  protected readonly sendingLabel = $localize`:@@feedback.sending:Sending…`;
}
