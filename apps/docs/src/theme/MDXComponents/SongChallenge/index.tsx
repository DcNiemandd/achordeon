import { translate } from '@docusaurus/Translate';
import { useState, type ReactNode } from 'react';

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
 * A challenge is one or more `steps`, each graded on its own. The check is the
 * AST, not the pixels — `parse` from `shared/domain` is pure and needs no canvas
 * or font, so a step can say "you got it" the instant the markup parses to the
 * shape it is after. Correctness is defined one of two ways: `solution` (the exact
 * target markup — the reader matches when their AST equals its) for the mechanical
 * steps, or `check` (a predicate on the AST) for the few steps that have more than
 * one right answer.
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

/** One graded step of a challenge. */
export interface Step {
  /** What the reader is being asked to do, shown above the exercise. */
  prompt?: string;
  /**
   * The markup this step starts from. On the first step it defaults to the
   * challenge's own `content`; on a later step, set it to reset the editor to a
   * known base when the step is entered — which is how an open-ended step (many
   * valid forms) hands the next one a single, canonical starting point. Omit it to
   * carry the reader's own markup forward instead.
   */
  content?: string;
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

export interface SongChallengeProps extends Step {
  /** The markup the first step starts from — the editor's initial document. */
  content: string;
  /**
   * The steps, in order. Omit for a one-step challenge and write the step's fields
   * (`prompt`, `solution`, `check`, `feedback`) directly on the component instead.
   */
  steps?: Step[];
}

/** The .mdx template literal starts on the line after the backtick. */
function trimSource(content: string): string {
  return content.replace(/^\n/, '').replace(/\s+$/, '');
}

/**
 * Turn a step's two ways of defining "correct" into the one thing grading needs:
 * a predicate on the reader's AST. `check` wins when given; otherwise `solution`
 * is parsed and compared by value (both ASTs come from the same parser, so their
 * JSON key order is identical — a serialise-and-compare is a sound deep equal
 * here). With neither, nothing is ever correct.
 */
function isSolved(step: Step, ast: SongAst): boolean {
  if (step.check) {
    return step.check(ast);
  }
  if (step.solution != null) {
    return (
      JSON.stringify(ast) ===
      JSON.stringify(parse(trimSource(step.solution), theory))
    );
  }
  return false;
}

export default function SongChallenge(props: SongChallengeProps): ReactNode {
  const { content, steps: stepsProp } = props;
  // One API, two spellings: a `steps` array, or the step's fields written flat on
  // the component for the common one-step case.
  const steps: Step[] = stepsProp ?? [props];

  const [index, setIndex] = useState(0);
  const [source, setSource] = useState(() =>
    trimSource(steps[0]?.content ?? content),
  );

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Pure and font-free, so this runs on the server too and the very first paint
  // already knows whether the starting content is right (it never is, by design).
  const ast = parse(source, theory);
  const solved = isSolved(step, ast);
  const message = solved
    ? null
    : (step.feedback?.find((rule) => rule.when(ast))?.message ?? null);

  function next(): void {
    const following = steps[index + 1];
    // A step that declares its own `content` resets the editor to it; otherwise
    // the reader's markup carries into the next step unchanged.
    if (following?.content != null) {
      setSource(trimSource(following.content));
    }
    setIndex(index + 1);
  }

  return (
    <div className={styles.challenge}>
      {steps.length > 1 ? (
        <span className={styles.progress}>
          {translate(
            {
              id: 'songChallenge.progress',
              message: 'Step {current} of {total}',
              description:
                'Which step of a multi-step exercise the reader is on',
            },
            { current: index + 1, total: steps.length },
          )}
        </span>
      ) : null}
      {step.prompt ? <p className={styles.prompt}>{step.prompt}</p> : null}
      <SongPreview content={content} value={source} onChange={setSource} />
      <div className={styles.footer}>
        <p
          className={solved ? styles.correct : styles.pending}
          role="status"
          aria-live="polite"
        >
          {solved
            ? translate({
                id: 'songChallenge.correct',
                message: 'Correct',
                description: 'Shown when a step has been solved',
              })
            : (message ??
              translate({
                id: 'songChallenge.pending',
                message: 'Not yet',
                description: 'Shown while a step is not yet solved',
              }))}
        </p>
        {/* Solved and more to do → move on. Solved and last → nothing left. Not
            solved yet → the way out, where there is one answer to give (an
            open-ended `check` step has nothing single to reveal). The controlled
            markup carries every one of these straight into the editor. */}
        {solved ? (
          !isLast ? (
            <button type="button" className={styles.next} onClick={next}>
              {translate({
                id: 'songChallenge.next',
                message: 'Next',
                description:
                  'Button that advances to the next step of an exercise',
              })}
            </button>
          ) : null
        ) : step.solution != null ? (
          <button
            type="button"
            className={styles.showSolution}
            onClick={() =>
              step.solution != null && setSource(trimSource(step.solution))
            }
          >
            {translate({
              id: 'songChallenge.showSolution',
              message: 'Show solution',
              description: 'Button that fills the editor with the step answer',
            })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
