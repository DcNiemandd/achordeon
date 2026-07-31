import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  // Same source as the navbar and the docs pages. A plain <a>, not <Link>: the
  // app is not a route of this site, and `<Link>` would either rewrite the href
  // with the locale prefix or — for the absolute form — hand it to the
  // broken-link checker, which resolves our own domain back to an internal path
  // and fails the build on a page Docusaurus does not own.
  const appLink = siteConfig.customFields?.appLink as string;
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        {/* Not `siteConfig.tagline`: that one is the meta description, and it is
            a single untranslated string — the Czech reader would get English on
            the biggest line of the page. */}
        <p className="hero__subtitle">
          <Translate id="homepage.hero.subtitle">
            Write your songs with the chords where you actually play them, and
            read them back as a clean sheet that fits one screen. It runs in the
            browser, installs like an app, and keeps working offline.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro"
          >
            <Translate id="homepage.cta.readDocs">Read the Docs</Translate>
          </Link>
          <a
            className="button button--primary button--lg"
            href={appLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: '1rem' }}
          >
            <Translate id="homepage.cta.launchApp">Launch App →</Translate>
          </a>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
