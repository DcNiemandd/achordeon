import useBaseUrl from '@docusaurus/useBaseUrl';
import Admonition from '@theme/Admonition';
import type { Props } from '@theme/MDXComponents/Img';
import clsx from 'clsx';
import { type ReactNode } from 'react';

import styles from './styles.module.css';

function transformImgClassName(className?: string): string {
  return clsx(className, styles.img);
}

type ImgProps = Props & {
  isDesign?: boolean;
};

export default function MDXImg(props: ImgProps): ReactNode {
  const { isDesign, ...rest } = props;
  // Resolve a root-relative `src` (e.g. `/img/foo.png`) against the site's
  // baseUrl, so images work under a subpath deployment. Absolute URLs and empty
  // values are left untouched by useBaseUrl.
  const src = useBaseUrl(typeof rest.src === 'string' ? rest.src : '');
  const image = (
    <img
      decoding="async"
      loading="lazy"
      {...rest}
      src={rest.src ? src : undefined}
      className={transformImgClassName(rest.className)}
    />
  );

  if (!rest.src) {
    return (
      <Admonition type="danger" title="TODO: image">
        {image}
      </Admonition>
    );
  }

  if (isDesign) {
    return (
      <Admonition type="warning" title="Design mockup">
        {image}
      </Admonition>
    );
  }

  return image;
}
