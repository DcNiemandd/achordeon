// The Download dialog — plans/import-chord-sheets.md, phase 4 (Q4, Q52)
//
// Controlled: a count in, a choice out. Only the ChordPro row is pinned here;
// the rest of the dialog predates its spec.

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DownloadDialog } from './download-dialog';
import type { DownloadChoice } from './transfer-model';

describe('DownloadDialog', () => {
  let fixture: ComponentFixture<DownloadDialog>;
  let chosen: DownloadChoice[];

  function mount(count: number): void {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(DownloadDialog);
    fixture.componentRef.setInput('count', count);
    chosen = [];
    fixture.componentInstance.chosen.subscribe((choice) => chosen.push(choice));
    fixture.detectChanges();
  }

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.option'));

  it.each([1, 3])(
    'offers a ChordPro file last, for %i song(s), and hands back that choice',
    (count) => {
      mount(count);
      const last = rows().at(-1);
      expect(last?.textContent).toContain('ChordPro file');
      last
        ?.querySelector<HTMLButtonElement>('[data-testid="download-chordpro"]')
        ?.click();
      expect(chosen).toEqual(['chordpro']);
    },
  );
});
