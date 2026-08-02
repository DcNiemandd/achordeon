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
      <Translate id="homepage.feature.write.title">
        Written the way you scribble it
      </Translate>
    ),
    description: (
      <Translate id="homepage.feature.write.description">
        Type the lyrics and put a chord in brackets where it is played — it
        prints above that exact syllable. Labels for verses and choruses, a
        little markdown for the rest. There is nothing else to learn.
      </Translate>
    ),
  },
  {
    title: (
      <Translate id="homepage.feature.page.title">One song, one page</Translate>
    ),
    description: (
      <Translate id="homepage.feature.page.description">
        Every song is laid out to fit a single screen or sheet, with no
        scrolling while you play — scale, columns and page shape are yours to
        set. Transpose in a click, then print it or download a PDF or PNG.
      </Translate>
    ),
  },
  {
    title: (
      <Translate id="homepage.feature.perform.title">
        Everyone on the same page
      </Translate>
    ),
    description: (
      <Translate id="homepage.feature.perform.description">
        Collect songs into songbooks and perform them one at a time. Open a
        lobby, share a PIN or a QR code, and the others follow along on their
        own screens as you move through the set.
      </Translate>
    ),
  },
  {
    title: (
      <Translate id="homepage.feature.account.title">
        Yours, and not only here
      </Translate>
    ),
    description: (
      <Translate id="homepage.feature.account.description">
        Your library lives in your browser and needs no account. Sign in when
        you want it kept somewhere else too — back the whole thing up to a file
        or to your own Google Drive, and bring it back on the next machine.
      </Translate>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx('col col--3')}>
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
