import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import type { WrapperProps } from '@docusaurus/types';
import NotFound from '@theme-original/NotFound';
import type NotFoundType from '@theme/NotFound';
import type { ReactNode } from 'react';

type Props = WrapperProps<typeof NotFoundType>;

/**
 * The 404 page keeps its words for a human and stops introducing itself to a
 * crawler as a missing page.
 *
 * **This page is also the app's front door.** GitHub Pages serves the site-root
 * 404 for every path it does not have a file for, which is every deep link into
 * the Angular app — `/app/audience/<PIN>`, `/app/songs/<id>/edit`, all of them.
 * `tools/spa-github-404.mjs` injects a script here that bounces those straight
 * back into `/app/?/<route>`, so a person never sees this page and lands where
 * the link pointed. A crawler runs no script: it reads this `<head>` and nothing
 * else. So the card a messenger drew for a shared audience link was titled
 * _Page Not Found_ — the app's own links previewing as a broken site.
 *
 * The fix is the metadata, not the copy: the heading below still says the page
 * was not found, because for the one visitor who really did mistype a docs URL
 * that is the true answer. What changes is what the crawler is handed — the
 * site's own name, tagline and social card, the same three the landing page
 * gives, so **any** app link previews as Achordeon.
 *
 * A static page cannot name the PIN (there is one 404 for every miss), and it is
 * not supposed to: the card says which app the link opens, and the app says the
 * rest once it has loaded.
 *
 * Read straight off `siteConfig` rather than written out here, so there is no
 * second copy of the site's name and pitch to drift — and no new string to
 * translate. `<Head>` comes after the original so its `<title>` and `og:title`
 * are the later declaration, which is the one Helmet keeps.
 */
export default function NotFoundWrapper(props: Props): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <>
      <NotFound {...props} />
      <Head>
        <title>{siteConfig.title}</title>
        <meta property="og:title" content={siteConfig.title} />
        <meta name="description" content={siteConfig.tagline} />
        <meta property="og:description" content={siteConfig.tagline} />
      </Head>
    </>
  );
}
