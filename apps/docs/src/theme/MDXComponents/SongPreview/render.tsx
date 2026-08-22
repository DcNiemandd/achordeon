import { translate } from '@docusaurus/Translate';
import { useColorMode } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  SETTINGS,
  parse,
  type GlobalSettings,
  type SongAst,
} from '@achordeon/shared/domain';
import {
  createCanvasMeasurer,
  emit,
  layoutCore,
} from '@achordeon/shared/render-core';

import { theory } from './theory';

import styles from './styles.module.css';

/**
 * The render half of a live example: markup in, the app's own SVG out, in a box
 * cut to the song. Both `SongPreview` (syntax docs) and `SongChallenge`
 * (tutorial exercises) mount this, so there is one renderer, one measurer, and
 * one font-epoch dance on the page — not a copy per component.
 *
 * It is the real pipeline — `parse` from `shared/domain`, `layoutCore` + `emit`
 * from `shared/render-core` — not a lookalike. A page that only *described* what
 * a doubled bracket does would drift from the parser the day the parser changed;
 * this one cannot, because it asks it.
 *
 * **No settings, by design.** It takes the content and nothing else. Every render
 * setting stays at its `SETTINGS` default, so a reader comparing two examples is
 * looking at a difference the *markup* makes — the one thing the syntax docs are
 * about. The two exceptions below (`scale`, `aspectRatio`) are not settings
 * offered to a reader; they are how the preview gets a box that hugs its song
 * instead of an empty A4 page.
 */
export interface SongRenderProps {
  /** The markup to render — the live document, re-rendered on every keystroke. */
  content: string;
}

/**
 * One measurer for the page (it caches per font+string, and every keystroke
 * re-measures the same tokens). Constructing it touches no canvas — the context
 * is acquired on first `measure` — so this is safe at module scope in a
 * pre-rendered site.
 */
const measurer = createCanvasMeasurer();

/** Every setting at its registry default — the app's own out-of-the-box song. */
function defaultSettings(): GlobalSettings {
  return Object.fromEntries(
    Object.entries(SETTINGS).map(([key, def]) => [key, def.default]),
  ) as GlobalSettings;
}

/**
 * The laid-out content's own size, in base units.
 *
 * `layoutCore` returns the *render box* — the content box grown to the shape of
 * the `aspectRatio` setting — and never the content box itself. But the growth
 * only ever pads the deficient axis, so an extreme ratio leaves the other axis
 * untouched: a near-zero ratio is always wider than the content, so the box takes
 * the content's width; a huge one is always taller, so it takes its height. Two
 * probes, one dimension each. Both run at `scale: 1` because the auto-fit floor
 * (`minBoxEm`) grows the box for 'auto' and would inflate the answer.
 */
function contentSize(
  ast: SongAst,
  settings: GlobalSettings,
): { width: number; height: number } {
  const probe = { ...settings, scale: 1 };
  return {
    width: layoutCore(ast, { ...probe, aspectRatio: 1e-6 }, measurer).box.width,
    height: layoutCore(ast, { ...probe, aspectRatio: 1e6 }, measurer).box
      .height,
  };
}

/**
 * Markup → SVG, in a box the shape of the song.
 *
 * The `aspectRatio` default is A4, which is right for a page and wrong for a
 * two-line example: it would put one lyric in the middle of an enormous portrait
 * sheet, and the sheet is what the reader's eye would scale. Giving the box the
 * content's *own* ratio makes the two identical — no letterbox, no slack — so the
 * preview is exactly as tall as the song is and the CSS below has something
 * honest to size against. `scale: 1` for the same reason: the auto-fit floor
 * exists to stop a short song being magnified across a page, and here there is no
 * page to magnify it across.
 */
function renderSvg(content: string, isDark: boolean): string {
  const ast = parse(content, theory);
  const settings = defaultSettings();
  const { width, height } = contentSize(ast, settings);
  if (width <= 0 || height <= 0) {
    return '';
  }
  const plan = layoutCore(
    ast,
    { ...settings, scale: 1, aspectRatio: width / height },
    measurer,
    // The corner, not the middle. `contentX`/`contentY` default to centred, which
    // is right for a page a song does not fill; this box is cut to the song, so
    // there is nothing to centre it in — and an example that starts where the
    // markup beside it starts is the one the eye can follow line for line.
    { align: 'top-left', dark: isDark },
  );
  return emit(plan);
}

export default function SongRender({ content }: SongRenderProps): ReactNode {
  const isBrowser = useIsBrowser();
  const { colorMode } = useColorMode();

  /**
   * Bumped once the real face has landed.
   *
   * The renderer measures with a canvas, and a canvas asked about a font the
   * browser has not fetched yet answers about the *fallback* — metrics that are
   * wrong by a few percent, which is enough to slide every chord off its
   * character. Worse, the measurer memoises, so without this they would stay
   * wrong. Same fix the app's `RenderService` makes: drop the cache when the
   * fonts settle and re-render. (`font-display: block` in `custom.css` keeps the
   * wrong frame from being painted in the first place.)
   */
  const [fontEpoch, setFontEpoch] = useState(0);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) {
      return;
    }
    let isLive = true;
    // Ask for the face explicitly: a webfont is fetched only when something on
    // the page uses it, and on the first frame nothing has been drawn yet.
    void Promise.all([
      fonts.load('16px "Roboto Mono"'),
      fonts.load('bold 16px "Roboto Mono"'),
      fonts.load('italic 16px "Roboto Mono"'),
    ])
      .then(() => fonts.ready)
      .then(() => {
        if (!isLive) {
          return;
        }
        measurer.clear();
        setFontEpoch((epoch) => epoch + 1);
      });
    return () => {
      isLive = false;
    };
  }, []);

  const svg = useMemo(() => {
    // Nothing is rendered server-side: the measurer needs a canvas, and a static
    // build has none. The first client render is what draws the picture.
    if (!isBrowser) {
      return '';
    }
    // `fontEpoch` is a cache-buster, not an input: it is in the deps so the
    // render re-runs against the real face (see above), and read nowhere.
    return renderSvg(content, colorMode === 'dark');
  }, [isBrowser, content, colorMode, fontEpoch]);

  return (
    <div className={styles.column}>
      <span className={styles.caption}>
        {translate({
          id: 'songPreview.output',
          message: 'Render',
          description: 'Caption above the rendered output of a live example',
        })}
      </span>
      <div
        className={styles.output}
        // The SVG is built here from text the reader typed, by a serializer that
        // XML-escapes every value it writes (`emit`) — no markup of theirs
        // survives into the document.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
