import useBaseUrl from '@docusaurus/useBaseUrl';
import Admonition from '@theme/Admonition';
import type { Props } from '@theme/MDXComponents/Img';
import clsx from 'clsx';
import { type ReactNode } from 'react';

import styles from './styles.module.css';

function transformImgClassName(className?: string, shadow?: boolean): string {
  return clsx(className, styles.img, shadow && styles.shadow);
}

type ImgProps = Props & {
  isDesign?: boolean;
  /** Lift the image off the page with a soft drop shadow (e.g. a floating
   * song render that would otherwise blend into the white page). */
  shadow?: boolean;
};

export default function MDXImg(props: ImgProps): ReactNode {
  const { isDesign, shadow, ...rest } = props;
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
      className={transformImgClassName(rest.className, shadow)}
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
