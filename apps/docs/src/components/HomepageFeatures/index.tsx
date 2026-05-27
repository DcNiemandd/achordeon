import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Real-time channels',
    description: (
      <>
        One sender, many receivers — broadcast updates over a shared channel
        with sub-second latency.
      </>
    ),
  },
  {
    title: 'Browser-first',
    description: (
      <>
        Runs entirely in the browser. No client install, no native binaries —
        open the URL, you're in.
      </>
    ),
  },
  {
    title: 'Open source',
    description: (
      <>
        MIT licensed, fully open. Fork it, self-host it, or contribute back on
        GitHub.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
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
