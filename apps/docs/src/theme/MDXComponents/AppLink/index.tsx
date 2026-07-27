import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { type ReactNode } from 'react';

/**
 * A link to the Angular app from inside a doc page.
 *
 * The app lives outside Docusaurus's route table, and it is ONE bundle for every
 * language (PRD-INFRASTRUCTURE.md §11) — so its URL must not pick up the locale
 * prefix. A plain markdown link does: `@theme/MDXComponents`'s `a` routes through
 * `<Link>`, which prepends the locale-aware baseUrl and turns `/app/` into
 * `/cs/app/` on the Czech pages. A bare `<a>` with the configured `appLink`
 * bypasses that, and the href stays the same value the navbar uses (`APP_LINK`,
 * set per deploy), so the domain lives in exactly one place.
 */
export default function AppLink({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const href = (siteConfig.customFields?.appLink as string | undefined) ?? '/';

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
