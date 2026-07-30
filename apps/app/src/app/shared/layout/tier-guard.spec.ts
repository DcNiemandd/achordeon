// TierGuard — Epic 11 ▸ tierGuard
// Spec: PRD-INFRASTRUCTURE.md §10, CONTEXT.md §Tiers

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TierGuard } from './tier-guard';

describe('TierGuard', () => {
  let guard: TierGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(TierGuard);
  });

  it('assumes free until the shell connects an account', () => {
    expect(guard.hasPremium()).toBe(false);
  });

  it('lends a testing feature to a free account but holds the rest back', () => {
    // The decision: hosting is lent for testing, so a Free user gets it and is
    // told what it is; automatic sync is held behind the tier, so its gate is
    // real even now.
    expect(guard.isAllowed('audience-host')).toBe(true);
    expect(guard.isAllowed('auto-sync')).toBe(false);
  });

  it('marks Premium features for a free account', () => {
    expect(guard.isMarked('audience-host')).toBe(true);
    expect(guard.isMarked('auto-sync')).toBe(true);
  });

  it('flags which marked features are lent for testing', () => {
    // Drives the marker copy: "available for testing" vs a plain "Premium".
    expect(guard.isTesting('audience-host')).toBe(true);
    expect(guard.isTesting('auto-sync')).toBe(false);
  });

  it('marks nothing for someone who already pays', () => {
    const isPro = signal(false);
    guard.connect(() => isPro());

    expect(guard.isMarked('auto-sync')).toBe(true);

    isPro.set(true);
    expect(guard.hasPremium()).toBe(true);
    // Selling a Premium user their own feature is noise, not information.
    expect(guard.isMarked('auto-sync')).toBe(false);
    expect(guard.isMarked('audience-host')).toBe(false);
  });
});
