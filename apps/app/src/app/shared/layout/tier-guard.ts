// Tier gate — Epic 11 ▸ tierGuard
// Spec: PRD-INFRASTRUCTURE.md §10 (highlight, not a hard block, during testing),
// CONTEXT.md §Tiers / §Premium highlight

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
 * Gates the Premium features — by **highlighting** them, not by blocking them.
 *
 * During the testing phase every gate is open (CONTEXT.md §Tiers: hosting is
 * "extended to Free users during the testing phase"), so the guard's answer to
 * "may I?" is always yes and its real job is the second question: "should this
 * control say it is Premium?" A control that works and is marked teaches what
 * paying unlocks; a disabled control just annoys.
 *
 * `IS_TESTING` below is the switch that ends that phase. Flipping it turns
 * `isAllowed` into a real gate, and the two call sites stop offering what they
 * cannot deliver — without any of them needing to know the tier rules.
 *
 * Like `ThemeApplier`, it takes the tier as a **plain accessor** rather than
 * injecting `AuthService`, so it stays inside `app/shared` under the import
 * ladder (PRD-UI-SHELL.md §3); the root shell wires it to the real one.
 */
@Injectable({ providedIn: 'root' })
export class TierGuard {
  /**
   * The testing phase, in one boolean. While it is true, Free users get the
   * Premium features and are told what they are — which is the whole point of
   * shipping it this way round.
   */
  private static readonly IS_TESTING = true;

  private tier: () => boolean = () => false;

  /** Whether the current account is Premium. False until the shell connects it,
   * and false forever in an offline-only build — where there is no account. */
  readonly hasPremium = computed(() => this.tier());

  /** Wire the real tier in (called once, from the root shell). */
  connect(hasPremium: () => boolean): void {
    this.tier = hasPremium;
  }

  /** May this feature be used? Always yes while testing — that is the decision. */
  isAllowed(feature: PremiumFeature): boolean {
    return (
      TierGuard.IS_TESTING || !IS_PREMIUM.has(feature) || this.hasPremium()
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
}

/** The registry as a set — see `PremiumFeature` for what earns a place in it. */
const IS_PREMIUM = new Set<PremiumFeature>(['audience-host', 'auto-sync']);
