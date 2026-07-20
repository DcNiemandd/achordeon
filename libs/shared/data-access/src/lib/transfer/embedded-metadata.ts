// Embedded metadata — Epic 7 ▸ subtask 2 (the "nice-to-have" half)
// Spec: PRD-INFRASTRUCTURE.md §8 ("accept … downloaded files with embedded
// metadata"), `export-import.mdx` ("the downloaded files has metadata that is
// the same as the exported files").
//
// A downloaded PNG carries the Export JSON inside it, in a PNG `tEXt` chunk. So
// a user can hand a friend **one** file — the picture is the picture, and the
// same file dropped on the import button rebuilds the song, settings and all.
// Editing the image in anything else drops the chunk, which is exactly what the
// docs warn about ("this metadata can be lost if you edit the files").
//
// **PNG only.** A PDF could carry the same string in its document properties,
// but reading it back means parsing PDF — a whole parser and its object streams
// — to recover a string we can already get from the PNG or the JSON. The gain
// is one more file type on the import button; the cost is a dependency the app
// otherwise has no use for. Not built.

/** The `tEXt` keyword. PNG allows 1–79 Latin-1 characters. */
const KEYWORD = 'achordeon';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/**
 * A `tEXt` chunk holding `json`, as bytes.
 *
 * The payload is UTF-8 while the chunk type says Latin-1. That is a deliberate
 * and very common lie: `iTXt` is the standards-correct home for UTF-8, and
 * nothing in the wild — including several image editors that would otherwise
 * carry the chunk through — handles it as reliably. Readers that do not know the
 * keyword ignore the chunk entirely either way, and the one reader that matters
 * is ours.
 */
function textChunk(json: string): Uint8Array {
  const payload = new TextEncoder().encode(`${KEYWORD}\0${json}`);
  const type = new TextEncoder().encode('tEXt');
  const chunk = new Uint8Array(12 + payload.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(type, 4);
  chunk.set(payload, 8);
  view.setUint32(
    8 + payload.length,
    crc32(chunk.subarray(4, 8 + payload.length)),
  );
  return chunk;
}

/**
 * The same PNG with the snapshot JSON inside it.
 *
 * The chunk goes **before `IEND`**, which is where a decoder stops looking; a
 * chunk after it is invisible to half the world. Anything that is not a PNG is
 * returned untouched rather than refused — the caller is a download pipeline,
 * and a picture without metadata is still the picture the user asked for.
 */
export async function embedSnapshot(blob: Blob, json: string): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isPng(bytes)) return blob;

  const iend = findIend(bytes);
  if (iend < 0) return blob;

  const chunk = textChunk(json);
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(bytes.subarray(iend), iend + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

/** The snapshot JSON a file carries, or `null` if it carries none. */
export async function readEmbeddedSnapshot(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isPng(bytes)) return null;

  const decoder = new TextDecoder();
  for (const { type, data } of chunks(bytes)) {
    if (type !== 'tEXt') continue;
    const split = data.indexOf(0);
    if (split < 0) continue;
    if (decoder.decode(data.subarray(0, split)) !== KEYWORD) continue;
    return decoder.decode(data.subarray(split + 1));
  }
  return null;
}

/** Walk the chunk list. Stops at the end of the buffer, never past it — a
 * truncated download must not run off into whatever memory follows. */
function* chunks(
  bytes: Uint8Array,
): Generator<{ type: string; data: Uint8Array; at: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('latin1');
  let at = PNG_SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = decoder.decode(bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) return;
    yield { type, data: bytes.subarray(at + 8, at + 8 + length), at };
    if (type === 'IEND') return;
    at += 12 + length;
  }
}

function findIend(bytes: Uint8Array): number {
  for (const chunk of chunks(bytes)) {
    if (chunk.type === 'IEND') return chunk.at;
  }
  return -1;
}
