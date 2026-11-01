'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { checkParsons, indentFor, parsonsPool } from '@/lib/study/parsons';
import type { StudyParsons } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { Html } from './html';

type Block = { id: string; text: string };
type Lists = { pool: Block[]; answer: Block[] };
type Where = keyof Lists;
/** What checkParsons reports. */
type Verdict = {
  ok: boolean;
  firstWrong: number | null;
  missing: number;
  extra: number;
};

/**
 * Move block `id` into list `to` before position `index` (positions counted
 * before the block leaves its own list), clamped to the list.
 */
function place(lists: Lists, id: string, to: Where, index: number): Lists {
  const from: Where = lists.pool.some((block) => block.id === id)
    ? 'pool'
    : 'answer';
  const at = lists[from].findIndex((block) => block.id === id);
  if (at < 0) return lists;
  const next: Lists = { pool: [...lists.pool], answer: [...lists.answer] };
  const [block] = next[from].splice(at, 1);
  const target = from === to && at < index ? index - 1 : index;
  next[to].splice(Math.max(0, Math.min(target, next[to].length)), 0, block);
  return next;
}

/** What a check says, in one sentence for the live region. */
function verdictText(verdict: Verdict) {
  if (verdict.ok) return 'Correct. Every line is in place.';
  const parts: string[] = [];
  if (verdict.firstWrong !== null)
    parts.push(`Line ${verdict.firstWrong + 1} is out of place.`);
  const counts = [
    verdict.missing > 0 &&
      `${verdict.missing} ${verdict.missing === 1 ? 'line is' : 'lines are'} missing`,
    verdict.extra > 0 &&
      `${verdict.extra} ${verdict.extra === 1 ? 'line does' : 'lines do'} not belong`,
  ].filter(Boolean);
  if (counts.length)
    parts.push(
      `${verdict.firstWrong === null ? 'So far so good, but ' : ''}${counts.join(' and ')}.`,
    );
  return parts.join(' ');
}

/**
 * A Parsons problem board: lines to use (a seeded shuffle of the solution
 * and its distractors) and the program being built, shown indented by brace
 * depth. Lines move by click, by drag and drop, or from the keyboard (Enter
 * or Space sends the focused line across, Alt+ArrowUp/Down moves it). The
 * caller shows the title and prompt; the board shows its own feedback and
 * the explanation (`problem.sol`) once solved or revealed. `onResult` runs on
 * every Check, and with `ok: false` when the solution is revealed unsolved.
 */
export function ParsonsBoard({
  problem,
  seed,
  onResult,
  math = false,
}: {
  problem: StudyParsons;
  seed: string;
  onResult: (r: { ok: boolean; answer: string[] }) => void;
  /** typeset TeX in the explanation */
  math?: boolean;
}) {
  const fresh = (): Lists => ({ pool: parsonsPool(problem, seed), answer: [] });
  const [lists, setLists] = useState(fresh);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongOnce, setWrongOnce] = useState(false);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // A different problem or seed starts over.
  const [source, setSource] = useState({ problem, seed });
  if (source.problem !== problem || source.seed !== seed) {
    setSource({ problem, seed });
    setLists(fresh());
    setVerdict(null);
    setMessage(null);
    setWrongOnce(false);
    setSolved(false);
    setRevealed(false);
  }

  const id = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    refs.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  /** Apply a move; the previous check's marks no longer apply. */
  const move = (blockId: string, to: Where, index: number, focus = true) => {
    setLists((prev) => place(prev, blockId, to, index));
    setVerdict(null);
    setMessage(null);
    if (focus) focusNext.current = blockId;
  };

  const answerText = lists.answer.map((block) => block.text);
  const depths = indentFor(answerText);

  const check = () => {
    if (!lists.answer.length) {
      setVerdict(null);
      setMessage('Move lines into your program first.');
      return;
    }
    const result = checkParsons(problem, answerText);
    setVerdict(result);
    setMessage(verdictText(result));
    if (result.ok) setSolved(true);
    else setWrongOnce(true);
    onResult({ ok: result.ok, answer: answerText });
  };

  const reset = () => {
    setLists(fresh());
    setVerdict(null);
    setMessage(null);
    setRevealed(false);
  };

  const reveal = () => {
    setRevealed(true);
    if (!solved) onResult({ ok: false, answer: answerText });
  };

  const onLineKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    where: Where,
    index: number,
  ) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown'))
      return;
    event.preventDefault();
    const blockId = lists[where][index].id;
    if (event.key === 'ArrowUp' && index > 0) move(blockId, where, index - 1);
    if (event.key === 'ArrowDown' && index < lists[where].length - 1)
      move(blockId, where, index + 2);
  };

  const dropProps = (to: Where, index: number, key: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (dragging === null) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setOver(key);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setOver((prev) => (prev === key ? null : prev));
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const blockId = event.dataTransfer.getData('text/plain') || dragging;
      setOver(null);
      setDragging(null);
      if (blockId) move(blockId, to, index, false);
    },
  });

  const dragProps = (blockId: string) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData('text/plain', blockId);
      event.dataTransfer.effectAllowed = 'move';
      setDragging(blockId);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  const lineRef = (blockId: string) => (node: HTMLButtonElement | null) => {
    if (node) refs.current.set(blockId, node);
    else refs.current.delete(blockId);
  };

  const hintId = `${id}-hint`;
  const solution = problem.lines.map((line) => line.trim());
  const solutionDepths = indentFor(solution);

  return (
    <div className="pz-board">
      <p id={hintId} className="sr">
        Enter or Space moves a line between the two lists; Alt+Up and Alt+Down
        move it within its list. Lines can also be dragged.
      </p>
      <div className="pz-lists">
        <div className="pz-col">
          <div className="pz-lbl" id={`${id}-pool`}>
            Lines to use
          </div>
          <ul
            className={cn('pz-list pz-pool', over === 'pool' && 'drop')}
            aria-labelledby={`${id}-pool`}
            {...dropProps('pool', lists.pool.length, 'pool')}
          >
            {lists.pool.map((block, index) => (
              <li
                key={block.id}
                className={cn(
                  dragging === block.id && 'dragging',
                  over === block.id && 'drop-before',
                )}
                {...dragProps(block.id)}
                {...dropProps('pool', index, block.id)}
              >
                <button
                  ref={lineRef(block.id)}
                  type="button"
                  className="pz-line"
                  aria-describedby={hintId}
                  onClick={() => move(block.id, 'answer', lists.answer.length)}
                  onKeyDown={(event) => onLineKey(event, 'pool', index)}
                >
                  <code>{block.text}</code>
                </button>
              </li>
            ))}
            {lists.pool.length === 0 && (
              <li className="pz-empty">Every line is in your program.</li>
            )}
          </ul>
        </div>
        <div className="pz-col">
          <div className="pz-lbl" id={`${id}-answer`}>
            Your program
          </div>
          <ol
            className={cn(
              'pz-list pz-answer',
              over === 'answer' && 'drop',
              verdict?.ok && 'ok',
            )}
            aria-labelledby={`${id}-answer`}
            {...dropProps('answer', lists.answer.length, 'answer')}
          >
            {lists.answer.map((block, index) => {
              const wrong = verdict?.firstWrong === index;
              return (
                <li
                  key={block.id}
                  className={cn(
                    wrong && 'bad',
                    dragging === block.id && 'dragging',
                    over === block.id && 'drop-before',
                  )}
                  {...dragProps(block.id)}
                  {...dropProps('answer', index, block.id)}
                >
                  <span className="pz-n" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button
                    ref={lineRef(block.id)}
                    type="button"
                    className="pz-line"
                    aria-describedby={hintId}
                    aria-label={`Line ${index + 1}${wrong ? ', out of place' : ''}: ${block.text}`}
                    onClick={() => move(block.id, 'pool', lists.pool.length)}
                    onKeyDown={(event) => onLineKey(event, 'answer', index)}
                  >
                    <code style={{ paddingLeft: `${depths[index] * 4}ch` }}>
                      {block.text}
                    </code>
                  </button>
                  <span className="pz-move">
                    <button
                      type="button"
                      aria-label={`Move line ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() =>
                        move(block.id, 'answer', index - 1, false)
                      }
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move line ${index + 1} down`}
                      disabled={index === lists.answer.length - 1}
                      onClick={() =>
                        move(block.id, 'answer', index + 2, false)
                      }
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </span>
                </li>
              );
            })}
            {lists.answer.length === 0 && (
              <li className="pz-empty">
                Click or drag lines here, in order.
              </li>
            )}
          </ol>
        </div>
      </div>
      <div className="answer pz-actions">
        <button type="button" className="pill pill-primary" onClick={check}>
          Check
        </button>
        <button type="button" className="pill" onClick={reset}>
          Reset
        </button>
        {wrongOnce && !solved && (
          <button
            type="button"
            className="textlink"
            aria-expanded={revealed}
            onClick={reveal}
          >
            Show solution
          </button>
        )}
      </div>
      <div
        className={cn('fb', verdict && (verdict.ok ? 'ok' : 'bad'))}
        aria-live="polite"
      >
        {message}
      </div>
      {revealed && !solved && (
        <div className="reveal sol pz-sol">
          <b>Solution</b>
          <pre>
            <code>
              {solution
                .map((line, i) => `${' '.repeat(solutionDepths[i] * 4)}${line}`)
                .join('\n')}
            </code>
          </pre>
        </div>
      )}
      {(solved || revealed) && problem.sol && (
        <Html className="reveal sol" html={problem.sol} math={math} />
      )}
    </div>
  );
}
