// ShareLinkService — handing a song to a person as a link (plan §5)
//
// The other half of the link import: the app writing what it can read. Not an AI
// feature at all — this is `CONTEXT.md` §Share — but it is the same code, so it
// was cheaper built alongside than bolted on.
//
// It sits beside `ExportService` and speaks the same selection, because it
// answers the same question with a different destination: the clipboard rather
// than a file. What travels is exactly what an export would carry, envelope and
// all, which is what makes a shared song replace rather than duplicate on the
// other side and what carries the Song's own settings with it.

import { Injectable, inject } from '@angular/core';
import { LocationStrategy } from '@angular/common';
import { ExportService, type ExportSelection } from './export-service';
import { SHARE_LINK_MAX_URL, toShareLink } from './share-link';

/** A built link, and whether it is short enough to survive being pasted. */
export interface ShareLink {
  readonly url: string;
  /**
   * `false` when the URL is longer than {@link SHARE_LINK_MAX_URL}.
   *
   * **The length is only knowable once the payload is built**, so the caller
   * measures the real thing rather than counting songs — the limit is length, and
   * one long song can trip it where three short ones would not.
   */
  readonly isShareable: boolean;
}

@Injectable({ providedIn: 'root' })
export class ShareLinkService {
  private readonly exporter = inject(ExportService);
  private readonly locationStrategy = inject(LocationStrategy);

  /**
   * Where the link points: **the app doing the sharing**, not `ACHORDEON_URL`.
   *
   * That constant is the address a *file* carries — it travels, is read by a
   * person who found it two years later, and must not name whichever host
   * happened to write it. A link is the opposite: it is opened, not filed, and it
   * has to open the app it came from. Pointing a link copied on `localhost` — or
   * on a preview deployment, or a self-hosted instance — at production would send
   * the user somewhere their song does not exist.
   *
   * `origin` plus `prepareExternalUrl`, the same way the Audience join link is
   * built (`StageSession.audienceUrl`), because it is the same question: the app
   * lives under a deploy base (`/app/`) and a bare origin would miss it.
   */
  private base(): string {
    return `${location.origin}${this.locationStrategy.prepareExternalUrl('/')}`;
  }

  /**
   * The selection as a link.
   *
   * Always the compressed form: the app has `CompressionStream`, and the plain
   * form exists for writers that do not. Compact rather than indented JSON — this
   * one is not for a person to read in a text editor, and every byte pays twice
   * after base64.
   */
  async build(selection: ExportSelection): Promise<ShareLink> {
    const snapshot = await this.exporter.snapshot(selection);
    const url = await toShareLink(JSON.stringify(snapshot), this.base());
    return { url, isShareable: url.length <= SHARE_LINK_MAX_URL };
  }

  /**
   * Put a built link on the clipboard.
   *
   * Returns whether it landed. A clipboard write can be refused — permissions, an
   * insecure context, a browser that wants a fresher user gesture — and a caller
   * that reported success anyway would leave someone pasting the wrong thing into
   * a message.
   */
  async copy(link: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      return false;
    }
  }
}
