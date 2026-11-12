// SongbookPrintFields — the print structure controls, shared by the songbook's
// settings dialog and its download dialog.
//
// Controlled: each change goes out as a whole SongbookPrint, and the host saves
// it and hands it back. Saving is a database write, so the next change can come
// before the last one is back.

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  DEFAULT_SONGBOOK_PRINT,
  type SongbookPrint,
} from '@achordeon/shared/domain';
import { SongbookPrintFields } from './songbook-print-fields';

describe('SongbookPrintFields', () => {
  let fixture: ComponentFixture<SongbookPrintFields>;
  let sent: SongbookPrint[];

  beforeEach(() => {
    fixture = TestBed.createComponent(SongbookPrintFields);
    fixture.componentRef.setInput('print', {
      ...DEFAULT_SONGBOOK_PRINT,
      hasSummary: false,
    });
    sent = [];
    fixture.componentInstance.changed.subscribe((print) => sent.push(print));
    fixture.detectChanges();
  });

  const find = <T extends HTMLElement>(testid: string): T =>
    fixture.nativeElement.querySelector(`[data-testid="${testid}"]`) as T;

  it('keeps an earlier change when a second comes before the host answers', () => {
    const summary = find<HTMLInputElement>('pdf-summary');
    summary.checked = true;
    summary.dispatchEvent(new Event('change'));

    // The host has not handed the print back yet: the input still says no summary.
    const position = find<HTMLSelectElement>('pdf-number-position');
    position.value = 'before-title';
    position.dispatchEvent(new Event('change'));

    expect(sent.at(-1)).toMatchObject({
      hasSummary: true,
      pageNumberPosition: 'before-title',
    });
  });

  it('follows the host when it hands back a different print', () => {
    fixture.componentRef.setInput('print', {
      ...DEFAULT_SONGBOOK_PRINT,
      hasPageNumbers: false,
    });
    fixture.detectChanges();
    const summary = find<HTMLInputElement>('pdf-summary');
    summary.checked = false;
    summary.dispatchEvent(new Event('change'));

    expect(sent.at(-1)).toMatchObject({
      hasPageNumbers: false,
      hasSummary: false,
    });
  });
});
