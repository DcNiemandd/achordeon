// File in / file out — Epic 7
// Spec: PRD-INFRASTRUCTURE.md §8 (Export / Import / Download all end in a file)
//
// The browser's two file gestures, in one place because they are the only lines
// in the transfer layer that touch the DOM. Everything above them deals in
// blobs and strings, which is what makes an export testable without a browser.

/** Kick off a download of `data` under `filename`. */
export function saveFile(
  data: Blob | string,
  filename: string,
  mime = '',
): void {
  const blob =
    typeof data === 'string' ? new Blob([data], { type: mime }) : data;
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
