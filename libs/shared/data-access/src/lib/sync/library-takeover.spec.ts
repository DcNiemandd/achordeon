// LibraryTakeover — replacing another account's library on this device
// (ADR-0004/0009, V2-15). The state behind the foreign-library notice, which
// three pages show, so it lives once here and the notice only draws it.

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LibraryOwnership } from '../stores/library-ownership';
import { LibraryTakeover } from './library-takeover';
import { SyncService } from './sync-service';

describe('LibraryTakeover', () => {
  let unsynced: Promise<boolean>;
  let adopt: jest.Mock;
  let finishAdopt: () => void;

  function takeover(): LibraryTakeover {
    TestBed.configureTestingModule({
      providers: [
        { provide: LibraryOwnership, useValue: { isForeign: signal(true) } },
        {
          provide: SyncService,
          useValue: { hasUnsyncedRows: () => unsynced, adoptDevice: adopt },
        },
      ],
    });
    return TestBed.inject(LibraryTakeover);
  }

  beforeEach(() => {
    unsynced = Promise.resolve(false);
    adopt = jest.fn(
      () => new Promise<void>((resolve) => (finishAdopt = resolve)),
    );
  });

  it('says whether this library belongs to another account', () => {
    expect(takeover().isForeign()).toBe(true);
  });

  it('warns on open when the library holds work that never synced', async () => {
    unsynced = Promise.resolve(true);
    const flow = takeover();
    flow.open();
    expect(flow.isConfirming()).toBe(true);
    await unsynced;
    expect(flow.isUnsynced()).toBe(true);
  });

  it('gives the plain warning when the question cannot be answered', async () => {
    unsynced = Promise.reject(new Error('db'));
    const flow = takeover();
    flow.open();
    await unsynced.catch(() => undefined);
    await Promise.resolve();
    expect(flow.isUnsynced()).toBe(false);
  });

  it('replaces once, holds the confirm while it runs, then closes', async () => {
    const flow = takeover();
    flow.open();
    const replacing = flow.replace();
    expect(flow.isBusy()).toBe(true);
    void flow.replace();
    flow.cancel();
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(flow.isConfirming()).toBe(true);

    finishAdopt();
    await replacing;
    expect(flow.isBusy()).toBe(false);
    expect(flow.isConfirming()).toBe(false);
  });

  it('cancels when nothing is running', () => {
    const flow = takeover();
    flow.open();
    flow.cancel();
    expect(flow.isConfirming()).toBe(false);
  });
});
