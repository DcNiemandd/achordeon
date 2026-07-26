// DocumentTitle — what the browser tab says
//
// The Router is faked down to the one thing this reads: the URL of the last
// successful navigation, as a signal (which is what it already is in Angular 21).

import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { DocumentTitle } from './document-title';

function setUp(url = '/songs') {
  const finalUrl = signal(url);
  const router = {
    lastSuccessfulNavigation: () => ({ finalUrl: finalUrl() }),
    serializeUrl: (value: unknown) => String(value),
    url,
  };
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: router }],
  });
  return { title: TestBed.inject(DocumentTitle), goTo: finalUrl.set };
}

describe('DocumentTitle', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('names the app first when you are in one of its modules', () => {
    const { title, goTo } = setUp('/songs');
    expect(title.title()).toBe('Achordeon - Songs');

    goTo('/songbooks');
    expect(title.title()).toBe('Achordeon - Songbooks');

    goTo('/settings');
    expect(title.title()).toBe('Achordeon - Settings');
  });

  // '/songbooks'.startsWith('/songs') is false — the prefix match is safe.
  it('does not read /songbooks as /songs', () => {
    const { title } = setUp('/songbooks/abc');
    expect(title.title()).toBe('Achordeon - Songbooks');
  });

  it('names the document first once a page claims it', () => {
    const { title } = setUp('/songs/abc/edit');
    title.claim(() => 'Down by the River');

    expect(title.title()).toBe('Down by the River - Achordeon');
  });

  // A song's name arrives an IndexedDB read after the route does, and
  // "- Achordeon" with a hole in front of it is worse than the module title.
  it('falls back to the module while the claimed name is still empty', () => {
    const { title } = setUp('/songs/abc/edit');
    const name = signal('');
    title.claim(name);

    expect(title.title()).toBe('Achordeon - Songs');

    name.set('Down by the River');
    expect(title.title()).toBe('Down by the River - Achordeon');
  });

  it('goes back to the module when the page releases its claim', () => {
    const { title } = setUp('/songs/abc/edit');
    const release = title.claim(() => 'Down by the River');

    release();

    expect(title.title()).toBe('Achordeon - Songs');
  });

  // The next page can claim before the last one is done tearing down, and a late
  // release must not wipe a title that is no longer its own.
  it('ignores a release from a claim that has already been replaced', () => {
    const { title } = setUp('/songbooks/abc');
    const releaseOld = title.claim(() => 'Old Book');
    title.claim(() => 'New Book');

    releaseOld();

    expect(title.title()).toBe('New Book - Achordeon');
  });

  it('writes the title onto the document', () => {
    const { title } = setUp('/stage');
    TestBed.tick();
    expect(document.title).toBe('Achordeon - Stage');

    title.claim(() => 'Performing');
    TestBed.tick();
    expect(document.title).toBe('Performing - Achordeon');
  });
});
