// The Convert bar — plans/import-chord-sheets.md, phase 2 (Q5, Q8, Q34)
//
// Driven the way the page drives it: the editor hands it what was pasted, and it
// answers with the text to put in the paste's place. Whether a paste is a Chord
// sheet at all is decided here too, so "nothing happens on plain text" is pinned
// at the same seam as everything the bar does.

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ChordTheory } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/chord-theory';
import { ConvertBar } from './convert-bar';

const GERMAN_SHEET = [
  'Ami     F',
  'Some words',
  'C       H7',
  'More words',
].join('\n');

describe('ConvertBar', () => {
  let fixture: ComponentFixture<ConvertBar>;
  let replaced: string[];
  let dismissed: number;

  function mount(paste: string | null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ChordTheory, useClass: TonalChordTheory }],
    });
    fixture = TestBed.createComponent(ConvertBar);
    replaced = [];
    dismissed = 0;
    fixture.componentInstance.replace.subscribe((text) => replaced.push(text));
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);
    pasteText(paste);
  }

  function pasteText(paste: string | null): void {
    fixture.componentRef.setInput('paste', paste);
    fixture.detectChanges();
  }

  const find = (testid: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  const click = (testid: string) => {
    const el = find(testid);
    expect(el).not.toBeNull();
    el?.click();
    fixture.detectChanges();
  };

  it('stays out of the way of plain text', () => {
    mount('Some words\nMore words');
    expect(find('convert-bar')).toBeNull();
  });

  it('offers to convert a chord sheet, asking nothing else', () => {
    mount(GERMAN_SHEET);
    expect(find('convert-bar')).not.toBeNull();
    expect(find('convert-bar-german')).toBeNull();
    expect(find('convert-bar-english')).toBeNull();
  });

  it('converts into English chords, ending as the paste ended, and goes away', () => {
    mount(GERMAN_SHEET);
    click('convert-bar-convert');
    expect(replaced).toEqual(['[Am]Some wor[F]ds\n[C]More wor[B7]ds']);
    expect(dismissed).toBe(1);
  });

  it('closes with the cross, leaving the paste untouched', () => {
    mount(GERMAN_SHEET);
    click('convert-bar-close');
    expect(replaced).toEqual([]);
    expect(dismissed).toBe(1);
  });
});
