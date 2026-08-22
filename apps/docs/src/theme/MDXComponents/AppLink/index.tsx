import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { type ReactNode } from 'react';

/**
 * A link to the Angular app from inside a doc page.
 *
 * Writing the URL in the .mdx would put the domain in two more files (en + cs),
 * so the href comes from the config instead — the same `appLink` the navbar, the
 * footer and the landing page use, built from DOCS_URL + APP_LINK per deploy.
 */
export default function AppLink({
  to,
  children,
}: {
  /**
   * A route inside the app, without a leading slash (`songbooks`, `settings`).
   * Omit it for the app's home.
   *
   * The app is a single bundle behind one base href, and a deep link into it
   * survives a cold load: GitHub Pages has no SPA fallback, so the deploy
   * injects one into the root 404 (`tools/spa-github-404.mjs`), which bounces
   * `/app/songbooks` back through `/app/?/songbooks`.
   */
  to?: string;
  children: ReactNode;
}): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const base = (siteConfig.customFields?.appLink as string | undefined) ?? '/';
  // `appLink` always ends in a slash (the config resolves it that way), so a
  // route is appended, not resolved against — `new URL` would eat the last
  // segment of a base like `/app/` given a relative path on some inputs.
  const href = to
    ? `${base.replace(/\/$/, '')}/${to.replace(/^\//, '')}`
    : base;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
