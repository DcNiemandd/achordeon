import { TestBed } from '@angular/core/testing';
import { Stats } from './stats';

const ENDPOINT = 'https://count.example/count';

/**
 * The beacon, and mostly the switch over it.
 *
 * Every assertion here is a line of `docs/privacy.mdx` restated as code: the
 * page promises what leaves this file, so what leaves this file is what is
 * tested. The counting itself is one `Image` — captured below, since a 1×1 GIF
 * request is the whole transport.
 */
describe('Stats', () => {
  const RealImage = globalThis.Image;
  let sent: string[];
  let meta: HTMLMetaElement;

  beforeEach(() => {
    sent = [];
    meta = document.createElement('meta');
    meta.setAttribute('name', 'achordeon-goatcounter');
    meta.setAttribute('content', ENDPOINT);
    document.head.append(meta);
    localStorage.clear();

    class Beacon {
      set src(value: string) {
        sent.push(value);
      }
    }
    (globalThis as unknown as { Image: unknown }).Image = Beacon;
  });

  afterEach(() => {
    meta.remove();
    (globalThis as unknown as { Image: unknown }).Image = RealImage;
    TestBed.resetTestingModule();
  });

  const stats = () => TestBed.inject(Stats);
  const params = (index = 0) => new URL(sent[index]).searchParams;

  it('counts a visit with the path the navigation gave it', () => {
    stats().count('/songs/12345678-1234-1234-1234-123456789abc?q=fire');
    // The id and the query are what the promise is about: one library, one row.
    expect(params().get('p')).toBe('/songs/:id');
  });

  it('leaves the screen size off until it is allowed', () => {
    const beacon = stats();
    beacon.count('/songs');
    expect(params().get('s')).toBeNull();

    beacon.allow(true);
    beacon.count('/songs');
    expect(params(1).get('s')).not.toBeNull();
  });

  it('says nothing about a page shape while the switch is off', () => {
    // The whole reason the aspect ratio is a third category: it is a fact about
    // what somebody made, so an unasked count of it is the bug.
    stats().countAspectRatio('preset', '9:16');
    expect(sent).toHaveLength(0);
  });

  it('counts a page shape as an event once it is allowed', () => {
    const beacon = stats();
    beacon.allow(true);
    beacon.countAspectRatio('screen-sideways', '284:131');

    expect(params().get('e')).toBe('1');
    expect(params().get('p')).toBe('aspect/screen-sideways/284:131');
    // One fact per event: no referrer, and no screen size to join it against.
    expect(params().get('r')).toBeNull();
    expect(params().get('s')).toBeNull();
  });

  it('counts nothing at all once GoatCounter’s own opt-out is set', () => {
    const beacon = stats();
    beacon.allow(true);
    localStorage.setItem('skipgc', 't');

    beacon.count('/songs');
    beacon.countAspectRatio('custom', '3:5');
    expect(sent).toHaveLength(0);
  });
});
