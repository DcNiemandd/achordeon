// PrintOptionsStore — what this device remembers about printing: the paper of
// the last download, and the print structure of the virtual All songs book.
// Both live in localStorage, so each has to come back on its own after a reload.

import { TestBed } from '@angular/core/testing';
import { DEFAULT_SONGBOOK_PRINT } from '@achordeon/shared/domain';
import { PrintOptionsStore } from './print-options-store';

describe('PrintOptionsStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  /** A fresh store, as a reload builds one. */
  function reloaded(): PrintOptionsStore {
    TestBed.resetTestingModule();
    return TestBed.inject(PrintOptionsStore);
  }

  it('brings back the All songs print structure before any download was made', () => {
    reloaded().saveAllSongsPrint({
      ...DEFAULT_SONGBOOK_PRINT,
      hasSummary: true,
    });

    expect(reloaded().allSongsPrint().hasSummary).toBe(true);
  });

  it('brings back the paper of the last download', () => {
    const store = reloaded();
    store.save({ ...store.options(), marginMm: 7 });

    expect(reloaded().options().marginMm).toBe(7);
  });
});
