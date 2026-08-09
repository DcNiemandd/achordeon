// Keyboard shortcuts — how a component joins the stack
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md

import { DestroyRef, inject } from '@angular/core';
import { ShortcutRegistry } from './shortcut-registry';
import type { ShortcutLayer } from './shortcut';

/**
 * Put this component's shortcuts on top of the stack for as long as it lives.
 *
 * Call it from a field initialiser or a constructor — it needs an injection
 * context, and taking the layer down again on destroy is the whole reason a
 * dialog can shadow the screen behind it without either of them knowing about
 * the other.
 */
export function registerShortcuts(layer: ShortcutLayer): void {
  const registry = inject(ShortcutRegistry);
  registry.add(layer);
  inject(DestroyRef).onDestroy(() => registry.remove(layer));
}
