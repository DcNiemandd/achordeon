// File in / file out — Epic 7
// Spec: PRD-INFRASTRUCTURE.md §8 (Export / Import / Download all end in a file)
//
// The browser's two file gestures, in one place because they are the only lines
// in the transfer layer that touch the DOM. Everything above them deals in
// blobs and strings, which is what makes an export testable without a browser.

/** Guess at the picker's file-type hint from the extension. */
function mimeFor(filename: string, given: string): string {
  if (given) return given;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return (
    {
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.zip': 'application/zip',
    }[ext] ?? 'application/octet-stream'
  );
}

/**
 * Save `data` under `filename` — **letting the browser ask where**, if it can.
 *
 * `showSaveFilePicker` (Chromium) opens the OS save dialog, so a "choose the
 * folder" preference is honoured and the file lands where the user put it rather
 * than in a Downloads folder they then have to go and find. Where the API is
 * absent (Firefox, Safari) or the user dismisses the picker, it falls back to
 * the anchor download, which respects the browser's own "always ask" setting if
 * one is set.
 *
 * Async now, because the picker is: the caller awaits a real save. A dismissed
 * picker resolves quietly — cancelling a save is not an error.
 */
export async function saveFile(
  data: Blob | string,
  filename: string,
  mime = '',
): Promise<void> {
  const type = mimeFor(filename, mime);
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;

  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: filename.slice(filename.lastIndexOf('.') + 1),
            accept: { [type]: [extensionOf(filename)] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      // The user closed the picker: that is a cancelled save, not a failure, and
      // must not then fire an anchor download they did not ask for. Anything
      // else (a permission fault, an unsupported context) falls through to the
      // anchor, which always works.
      if ((error as DOMException)?.name === 'AbortError') return;
    }
  }

  downloadViaAnchor(blob, filename);
}

/** `.pdf`, `.json` … — the extension including the dot, or empty. */
function extensionOf(filename: string): string {
  const at = filename.lastIndexOf('.');
  return at < 0 ? '' : filename.slice(at);
}

/** The classic download: an `<a download>` clicked. The browser's own "ask
 * where to save" setting still applies if the user has turned it on. */
function downloadViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  // Not synchronous with the click: revoking immediately kills the download in
  // Firefox, which reads the URL on a later turn of the event loop.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Read a picked file as text (the Export JSON path). */
export function readTextFile(file: Blob): Promise<string> {
  return file.text();
}

/**
 * A filename component from a user-authored name.
 *
 * Deliberately aggressive: a song may be called `AC/DC — Back in Black?` and
 * every one of those characters is either a path separator or illegal on some
 * platform the file will be opened on. An empty result falls back rather than
 * producing a file called `.json`.
 */
export function toFileSlug(name: string, fallback = 'achordeon'): string {
  const slug = name
    // Decompose, then drop the combining marks: `Šárka` becomes `Sarka` rather
    // than `S-rka`, which is what stripping non-ASCII outright would give.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** `YYYY-MM-DD` — every exported filename carries the day it was made. */
export function fileDate(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Local, not ISO/UTC: the date in the name is the one the user's clock shows.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
