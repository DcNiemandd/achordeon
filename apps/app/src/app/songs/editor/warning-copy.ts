// Warning copy — Epic 5 ▸ subtask 4
// Spec: ADR-0005 (warnings are structured codes, not strings)

import type { Warning, WarningCode } from '@achordeon/shared/domain';
import type { EditorMarker } from './editor-model';

/**
 * What each parser warning says out loud.
 *
 * **The copy lives here, not in the domain** — the same rule as the settings
 * panel's help text (PRD-UI-SHELL.md §5.2). Warnings are structured codes
 * precisely so they can be localised (ADR-0005), and `shared/domain` is pure: it
 * must not take an `@angular/localize` dependency to describe itself.
 *
 * The `Record<WarningCode, …>` is load-bearing: add a code to the parser and this
 * fails to compile until someone decides what it says.
 */
const WARNING_COPY: Record<WarningCode, string> = {
  SHADOWED_TITLE: $localize`:@@warning.shadowedTitle:Only the last title is used. This one is ignored.`,
  SHADOWED_SUBTITLE: $localize`:@@warning.shadowedSubtitle:Only the last subtitle is used. This one is ignored.`,
};

/** Parser warnings → the editor's underlines. */
export function toMarkers(warnings: readonly Warning[]): EditorMarker[] {
  return warnings.map((warning) => ({
    line: warning.line,
    range: warning.range,
    message: WARNING_COPY[warning.code],
  }));
}
