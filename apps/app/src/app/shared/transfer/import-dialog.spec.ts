// The Import dialog — plans/import-chord-sheets.md, phase 3 (Q3)
//
// Where an Import starts: one row per way in. A row with files ends in the file
// picker for its own kind of file; what is then done with the files belongs to
// the Import preview, not here.

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ImportDialog } from './import-dialog';

describe('ImportDialog', () => {
  let fixture: ComponentFixture<ImportDialog>;
  let picked: (readonly File[])[];
  let songSite: number;

  function mount(isSongSiteAvailable?: boolean): void {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(ImportDialog);
    if (isSongSiteAvailable !== undefined) {
      fixture.componentRef.setInput('isSongSiteAvailable', isSongSiteAvailable);
    }
    picked = [];
    songSite = 0;
    fixture.componentInstance.picked.subscribe((files) => picked.push(files));
    fixture.componentInstance.songSite.subscribe(() => songSite++);
    fixture.detectChanges();
  }

  const find = <T extends HTMLElement>(testid: string): T => {
    const el = fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
    expect(el).not.toBeNull();
    return el as T;
  };

  /** What the browser does once the person has chosen files in the picker. */
  function choose(testid: string, files: File[]): void {
    const input = find<HTMLInputElement>(testid);
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('opens the picker for Achordeon files from its row', () => {
    mount();
    const input = find<HTMLInputElement>('import-achordeon-input');
    const click = jest
      .spyOn(input, 'click')
      .mockImplementation(() => undefined);
    find('import-achordeon').click();
    expect(click).toHaveBeenCalled();
    expect(input.accept).toContain('.achordeon');
    expect(input.accept).toContain('.png');
  });

  it('opens the picker for Chord sheet files from its row', () => {
    mount();
    const input = find<HTMLInputElement>('import-chord-sheet-input');
    const click = jest
      .spyOn(input, 'click')
      .mockImplementation(() => undefined);
    find('import-chord-sheet').click();
    expect(click).toHaveBeenCalled();
    for (const extension of ['.cho', '.chordpro', '.crd', '.pro', '.txt']) {
      expect(input.accept).toContain(extension);
    }
  });

  it('hands over the files chosen, from either row', () => {
    mount();
    const sheet = new File(['{t: A}'], 'a.cho');
    const library = new File(['{}'], 'b.achordeon');
    choose('import-chord-sheet-input', [sheet]);
    choose('import-achordeon-input', [library]);
    expect(picked).toEqual([[sheet], [library]]);
  });

  it('hands over nothing when the picker was cancelled', () => {
    mount();
    choose('import-chord-sheet-input', []);
    expect(picked).toEqual([]);
  });

  it('offers a song site only once one can be reached', () => {
    mount();
    expect(find<HTMLButtonElement>('import-song-site').disabled).toBe(true);
    mount(true);
    find('import-song-site').click();
    expect(songSite).toBe(1);
  });
});
