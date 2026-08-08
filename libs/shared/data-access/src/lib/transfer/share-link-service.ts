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
import { ACHORDEON_URL } from '@achordeon/shared/domain';
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
    const url = await toShareLink(JSON.stringify(snapshot), ACHORDEON_URL);
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
