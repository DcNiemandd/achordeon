import type { ReactNode } from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: ReactNode;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: (
      <Translate id="homepage.feature.realtime.title">
        Real-time channels
      </Translate>
    ),
    description: (
      <Translate id="homepage.feature.realtime.description">
        One sender, many receivers — broadcast updates over a shared channel
        with sub-second latency.
      </Translate>
    ),
  },
  {
    title: (
      <Translate id="homepage.feature.browser.title">Browser-first</Translate>
    ),
    description: (
      <Translate id="homepage.feature.browser.description">
        {`Runs entirely in the browser. No client install, no native binaries — open the URL, you're in.`}
      </Translate>
    ),
  },
  {
    title: <Translate id="homepage.feature.oss.title">Open source</Translate>,
    description: (
      <Translate id="homepage.feature.oss.description">
        MIT licensed, fully open. Fork it, self-host it, or contribute back on
        GitHub.
      </Translate>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
