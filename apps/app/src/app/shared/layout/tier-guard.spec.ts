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

  it('never blocks a Premium feature during testing', () => {
    // The whole decision: a Free user gets hosting and automatic sync, and is
    // told what they are. A disabled control would teach nobody anything.
    expect(guard.isAllowed('audience-host')).toBe(true);
    expect(guard.isAllowed('auto-sync')).toBe(true);
  });

  it('marks Premium features for a free account', () => {
    expect(guard.isMarked('audience-host')).toBe(true);
    expect(guard.isMarked('auto-sync')).toBe(true);
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
