// The pre-boot guards in index.html — Epic 11 ▸ deploy
//
// These run before the bundle exists, so nothing in the app can test them: the
// unit under test is the inline script itself, lifted out of the template and
// called with a fake `location`.
//
// The TEMPLATE, not the generated index.html: reading the output would make this
// suite depend on `gen-index`, and that target has a dev twin writing the same
// path — a test run would then overwrite the index a dev server is serving. The
// generator only substitutes the CSP placeholder, so a script in the template is
// a script in the shipped page.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The inline script whose body mentions `needle`, as a callable function. */
function inlineScript(needle: string): (location: unknown) => void {
  const html = readFileSync(join(__dirname, 'index.html.template'), 'utf8');
  const bodies = [
    ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
  ]
    .map(([, body]) => body)
    .filter((body) => body.includes(needle));

  expect(bodies).toHaveLength(1);
  return new Function('location', bodies[0]) as (location: unknown) => void;
}

describe('the https upgrade guard', () => {
  /** Where the guard sent us, or null if it left the page alone. */
  function upgrade(href: string): string | null {
    const url = new URL(href);
    let destination: string | null = null;
    inlineScript('location.protocol')({
      protocol: url.protocol,
      hostname: url.hostname,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      href,
      replace: (to: string) => (destination = to),
    });
    return destination;
  }

  it('upgrades a plain-http load of the deployed app', () => {
    // The bug this exists for: http is not a secure context, so
    // `crypto.randomUUID` is undefined and minting the device id kills the boot.
    expect(upgrade('http://achordeon.eu/app/songs')).toBe(
      'https://achordeon.eu/app/songs',
    );
  });

  it('carries the whole URL across, not just the origin', () => {
    expect(upgrade('http://achordeon.eu/app/?/songs#verse')).toBe(
      'https://achordeon.eu/app/?/songs#verse',
    );
  });

  it('leaves https alone', () => {
    expect(upgrade('https://achordeon.eu/app/songs')).toBeNull();
  });

  it.each(['http://localhost:4200/app/', 'http://127.0.0.1:4200/app/'])(
    'leaves the dev server alone (%s)',
    (href) => {
      // localhost is a secure context by definition, and there is no certificate
      // to upgrade to — redirecting would break every local run.
      expect(upgrade(href)).toBeNull();
    },
  );
});
