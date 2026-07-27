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
