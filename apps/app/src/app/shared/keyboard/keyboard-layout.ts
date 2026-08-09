// Keyboard shortcuts — what this keyboard is actually engraved with
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md

import { Injectable, signal } from '@angular/core';

/** The slice of the Keyboard API we use; `lib.dom` does not ship it. */
interface KeyboardLayoutSource {
  readonly keyboard?: { getLayoutMap?(): Promise<Iterable<[string, string]>> };
}

/**
 * Positions to glyphs, for the shortcuts dialog.
 *
 * Shortcuts bind to physical key positions (ADR-0015), so the dialog cannot
 * simply print the position's English name: on a Czech QWERTZ `KeyY` is
 * engraved Z, and telling a user to press Y would be telling them to press the
 * wrong key. `navigator.keyboard.getLayoutMap()` is the only way to ask, it is
 * Chromium-only, and where it is missing the dialog falls back to the English
 * letter — wrong for a minority of layouts, where the alternative is `KeyC`.
 *
 * Read once at startup. A layout change mid-session would need a re-read, and
 * the API's `layoutchange` event is not shipping anywhere yet.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardLayout {
  private readonly map = signal<ReadonlyMap<string, string>>(new Map());

  /** Empty until the browser answers, and empty forever where it will not. */
  readonly labels = this.map.asReadonly();

  constructor() {
    const source = navigator as unknown as KeyboardLayoutSource;
    void source.keyboard?.getLayoutMap?.().then(
      (layout) => this.map.set(new Map(layout)),
      // A rejection is a browser that has the method behind a permission or a
      // non-secure context. There is a fallback; there is nothing to report.
      () => undefined,
    );
  }
}
