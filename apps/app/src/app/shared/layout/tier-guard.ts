// Tier gate — Epic 11 ▸ tierGuard
// Spec: PRD-INFRASTRUCTURE.md §10 (highlight, not a hard block, for a testing
// feature), CONTEXT.md §Tiers / §Premium highlight

import { Injectable, computed } from '@angular/core';

/**
 * The features that are (or will become) Premium-only. **This list is the
 * decision** the guard exists to hold — CONTEXT.md §Tiers names them in prose;
 * here they are as the only place the app agrees on them:
 *
 * - `audience-host` — opening a Lobby. Joining one is free and always will be, so
 *   the Audience *module* is not gated; the create-lobby control is.
 * - `auto-sync` — automatic sync to Achordeon's servers. Manual Drive backup is
 *   free for everyone (PRD-INFRASTRUCTURE.md §6), so again it is the toggle that
 *   is gated, not the sync section.
 *
 * Both are **controls, not places**, which is why this is a service and not a
 * `CanActivateFn`: there is no premium-only route to keep anyone out of. When one
 * appears, `isAllowed` is the predicate a route guard would call.
 */
export type PremiumFeature = 'audience-host' | 'auto-sync';

/**
 * Gates the Premium features — some by **highlighting** them, some for real.
 *
 * A Premium feature is in one of two states, and the difference is a single set,
 * `IS_TESTING` below:
 *
 * - **Lent for testing** (`audience-host`). The gate is open: a Free user gets
 *   the feature and is told what it is. A control that works and is marked
 *   teaches what paying unlocks; a disabled control just annoys. Its marker reads
 *   "available for testing".
 * - **Held behind the tier** (`auto-sync`). The gate is real: `isAllowed` is
 *   `false` for a Free user, so the control stands down, and its marker reads a
 *   plain "Premium" — nothing is being lent, so nothing promises it is.
 *
 * Moving a feature between the two is editing one set. Taking `audience-host` out
 * of `IS_TESTING` is what ends its testing phase; nothing at the call sites has
 * to know the tier rules to follow along.
 *
 * Like `ThemeApplier`, it takes the tier as a **plain accessor** rather than
 * injecting `AuthService`, so it stays inside `app/shared` under the import
 * ladder (PRD-UI-SHELL.md §3); the root shell wires it to the real one.
 */
@Injectable({ providedIn: 'root' })
export class TierGuard {
  private tier: () => boolean = () => false;

  /** Whether the current account is Premium. False until the shell connects it,
   * and false forever in an offline-only build — where there is no account. */
  readonly hasPremium = computed(() => this.tier());

  /** Wire the real tier in (called once, from the root shell). */
  connect(hasPremium: () => boolean): void {
    this.tier = hasPremium;
  }

  /** May this feature be used? Yes for a feature that is not Premium, one lent
   * for testing, or one this account has paid for. */
  isAllowed(feature: PremiumFeature): boolean {
    return (
      IS_TESTING.has(feature) || !IS_PREMIUM.has(feature) || this.hasPremium()
    );
  }

  /**
   * Should this control wear the Premium marker (`<app-premium>`)?
   *
   * Only for someone who has not paid: a Premium user already knows, and marking
   * their own features as upsells is noise. Reads `hasPremium()`, so callers get
   * the reactivity of wherever they call it from — a template or a `computed`.
   */
  isMarked(feature: PremiumFeature): boolean {
    return !this.hasPremium() && IS_PREMIUM.has(feature);
  }

  /**
   * Is this feature lent to Free users for the testing phase? Decides which copy
   * the marker wears — "available for testing" when it is, a plain "Premium" when
   * it is genuinely held back. Only meaningful where `isMarked` is already true.
   */
  isTesting(feature: PremiumFeature): boolean {
    return IS_TESTING.has(feature);
  }
}

/** The registry as a set — see `PremiumFeature` for what earns a place in it. */
const IS_PREMIUM = new Set<PremiumFeature>(['audience-host', 'auto-sync']);

/** The subset of Premium features currently **lent to Free users** for the
 * testing phase. `isAllowed` is open for these and their marker says so; take a
 * feature out to make its gate real. */
const IS_TESTING = new Set<PremiumFeature>(['audience-host']);
