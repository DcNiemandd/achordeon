import { translate } from '@docusaurus/Translate';
import { useMemo, useState, type ReactNode } from 'react';

import { parse, type SongAst } from '@achordeon/shared/domain';

import SongPreview from '../SongPreview';
import { theory } from '../SongPreview/theory';

import styles from './styles.module.css';

/**
 * A song-markup exercise: prepared content the reader edits until it is right,
 * checked live against the same parser the app runs, with the app's own render
 * beside it so the reader sees what their markup becomes as they type.
 *
 * The two-up editor+render frame is `SongPreview`, run controlled — this owns the
 * markup so it can grade it and write it back on "Show solution", and adds the
 * prompt above and the verdict below. Nothing of the frame is duplicated here.
 *
 * The check is the AST, not the pixels — `parse` from `shared/domain` is pure and
 * needs no canvas or font, so a challenge can say "you got it" the instant the
 * markup parses to the shape it is after. Correctness is defined one of two ways:
 * `solution` (the exact target markup — the reader matches when their AST equals
 * its) for the mechanical steps, or `check` (a predicate on the AST) for the few
 * steps that have more than one right answer.
 */

/**
 * One graded "not yet" state: the shape the reader's markup is in short of the
 * goal, and what to say about it. Rules are tried in order and the first whose
 * `when` holds supplies the message — so they read general-to-specific ("no label
 * yet" before "a label, but not the right one").
 */
export interface FeedbackRule {
  when: (ast: SongAst) => boolean;
  message: string;
}

export interface SongChallengeProps {
  /** The markup the reader starts from — the editor's initial document. */
  content: string;
  /** What the reader is being asked to do, shown above the exercise. */
  prompt?: string;
  /**
   * The exact target: the reader is right when their AST equals this one's, and
   * it is what "Show solution" fills the editor with. Omit for open-ended steps —
   * a step with many right answers has no single markup to reveal.
   */
  solution?: string;
  /** An escape hatch for open-ended steps. When set, it decides — not `solution`. */
  check?: (ast: SongAst) => boolean;
  /**
   * Ordered diagnostics for the not-yet verdict. Consulted only while the step is
   * unsolved; the first matching rule's message replaces the bare "Not yet".
   * Correctness is still `solution`/`check` — these only name the near-misses.
   */
  feedback?: FeedbackRule[];
}

/** The .mdx template literal starts on the line after the backtick. */
function trimSource(content: string): string {
  return content.replace(/^\n/, '').replace(/\s+$/, '');
}

/**
 * Turn the two ways of defining "correct" into the one thing the component needs:
 * a predicate on the reader's AST. `check` wins when given; otherwise `solution`
 * is parsed once and compared by value (both ASTs come from the same parser, so
 * their JSON key order is identical — a serialise-and-compare is a sound deep
 * equal here). With neither, nothing is ever correct.
 */
function useOracle(props: SongChallengeProps): (ast: SongAst) => boolean {
  const { check, solution } = props;
  return useMemo(() => {
    if (check) {
      return check;
    }
    if (solution != null) {
      const target = JSON.stringify(parse(trimSource(solution), theory));
      return (ast: SongAst) => JSON.stringify(ast) === target;
    }
    return () => false;
  }, [check, solution]);
}

export default function SongChallenge(props: SongChallengeProps): ReactNode {
  const { content, prompt, solution, feedback } = props;
  const [source, setSource] = useState(() => trimSource(content));
  const isCorrect = useOracle(props);

  // Pure and font-free, so this runs on the server too and the very first paint
  // already knows whether the starting content is right (it never is, by design).
  const verdict = useMemo(() => {
    const ast = parse(source, theory);
    if (isCorrect(ast)) {
      return { solved: true, message: null as string | null };
    }
    const hit = feedback?.find((rule) => rule.when(ast));
    return { solved: false, message: hit?.message ?? null };
  }, [isCorrect, feedback, source]);

  return (
    <div className={styles.challenge}>
      {prompt ? <p className={styles.prompt}>{prompt}</p> : null}
      <SongPreview content={content} value={source} onChange={setSource} />
      <div className={styles.footer}>
        <p
          className={verdict.solved ? styles.correct : styles.pending}
          role="status"
          aria-live="polite"
        >
          {verdict.solved
            ? translate({
                id: 'songChallenge.correct',
                message: 'Correct',
                description: 'Shown when an exercise has been solved',
              })
            : (verdict.message ??
              translate({
                id: 'songChallenge.pending',
                message: 'Not yet',
                description: 'Shown while an exercise is not yet solved',
              }))}
        </p>
        {/* Only where there is one answer to show. An open-ended step (a `check`
            with no `solution`) has nothing single to reveal, so no button. The
            controlled markup carries the new document straight into the editor. */}
        {solution != null ? (
          <button
            type="button"
            className={styles.showSolution}
            onClick={() => setSource(trimSource(solution))}
          >
            {translate({
              id: 'songChallenge.showSolution',
              message: 'Show solution',
              description:
                'Button that fills the editor with the exercise answer',
            })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
