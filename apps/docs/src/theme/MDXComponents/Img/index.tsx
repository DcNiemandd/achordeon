import { translate } from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Admonition from '@theme/Admonition';
import type { Props } from '@theme/MDXComponents/Img';
import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './styles.module.css';

function transformImgClassName(className?: string, shadow?: boolean): string {
  return clsx(className, styles.img, shadow && styles.shadow);
}

type ImgProps = Props & {
  isDesign?: boolean;
  /** Lift the image off the page with a soft drop shadow (e.g. a floating
   * song render that would otherwise blend into the white page). */
  shadow?: boolean;
  /** Set to `false` for an image that gains nothing from a full-size view
   * (an icon, a tiny inline glyph). */
  isZoomable?: boolean;
};

/**
 * The full-size view of one image, in a modal `<dialog>`.
 *
 * A native dialog is what carries the behaviour: the top layer puts it above
 * every stacking context on the page, Escape closes it, and focus stays inside
 * it — none of which we have to write. It is portalled to the body so the
 * markup never lands inside the paragraph the image sits in.
 */
function ImageDialog({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    // A modal dialog does not stop the page behind it from scrolling, and a
    // wheel over the backdrop scrolling the docs away reads as a bug.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      // The dialog fills the viewport, so anything that lands on the element
      // itself rather than on its contents is a click beside the image.
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
    >
      {/* Clicking the image closes too — the whole surface is one way out. */}
      <img
        src={src}
        alt={alt}
        className={styles.full}
        onClick={() => ref.current?.close()}
      />
      <button
        type="button"
        className={styles.close}
        onClick={() => ref.current?.close()}
        aria-label={translate({
          id: 'image.dialog.close',
          message: 'Close the image',
          description: 'Label of the close button of the full-size image view',
        })}
      >
        ×
      </button>
    </dialog>,
    document.body,
  );
}

export default function MDXImg(props: ImgProps): ReactNode {
  const { isDesign, shadow, isZoomable = true, ...rest } = props;
  const [isOpen, setIsOpen] = useState(false);
  // Resolve a root-relative `src` (e.g. `/img/foo.png`) against the site's
  // baseUrl, so images work under a subpath deployment. Absolute URLs and empty
  // values are left untouched by useBaseUrl.
  const src = useBaseUrl(typeof rest.src === 'string' ? rest.src : '');
  let image: ReactNode = (
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

  if (isZoomable) {
    image = (
      <>
        {/* The button takes its accessible name from the image's own alt text;
            the title says what clicking it does. */}
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="dialog"
          title={translate({
            id: 'image.dialog.open',
            message: 'View full size',
            description: 'Tooltip of an image that opens in a full-size view',
          })}
          onClick={() => setIsOpen(true)}
        >
          {image}
        </button>
        {isOpen && (
          <ImageDialog
            src={src}
            alt={typeof rest.alt === 'string' ? rest.alt : undefined}
            onClose={() => setIsOpen(false)}
          />
        )}
      </>
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
