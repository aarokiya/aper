'use client';

import { useEffect, useState } from 'react';
import { stripHtml } from '@/lib/study/model';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import {
  formatInterval,
  intervalPreview,
  memoryOf,
  rate,
  type SrsGrade,
  type StudyItem,
} from '@/lib/study/srs';
import type { StudyCourseState } from '@/lib/study/types';
import { cn } from '@/lib/utils';
import { Tally } from './bits';
import { Html } from './html';
import { useNow } from './review/clock';
import {
  AnswerInput,
  checkTyped,
  isControlTarget,
  isTypingTarget,
  RatingBar,
  suggestedGrade,
  type ItemResult,
} from './review/item-views';

type DeckUi = { i: number; flip: boolean; only: boolean };

/** Deck position, side, and filter survive tab switches for the session (artifact FC). */
const decks = new Map<string, DeckUi>();

/**
 * A week's flashcards: flip with a click, Space, or Enter (typed cards ask
 * for the answer first), then rate Again / Hard / Good / Easy (keys 1–4).
 */
export function CardDeck({
  id,
  title,
  items,
  course,
  state,
  update,
  prefs,
}: {
  /** stable deck id, e.g. `abc1234:w3` */
  id: string;
  title: string;
  items: StudyItem[];
  course: { cid: string; math: boolean; codeLang?: string };
  state: StudyCourseState;
  update: (mutate: (draft: StudyCourseState) => void) => void;
  prefs: StudyPrefs;
}) {
  const now = useNow();
  const [ui, setUiState] = useState<DeckUi>(
    () => decks.get(id) ?? { i: 0, flip: false, only: false },
  );
  // Typed answer of the card on screen (cleared whenever the card changes).
  const [typed, setTyped] = useState<{ key: string; value: string; result: ItemResult | null }>({
    key: '',
    value: '',
    result: null,
  });
  const [nudge, setNudge] = useState(false);
  const setUi = (next: DeckUi) => {
    decks.set(id, next);
    setUiState(next);
  };
  // Legacy `cards` keys drop the `c:` item prefix.
  const known = (item: StudyItem) => state.cards[item.key.slice(2)] === 'know';
  const list = ui.only ? items.filter((item) => !known(item)) : items;
  const index = Math.min(ui.i, Math.max(0, list.length - 1));
  const item = list[index] as StudyItem | undefined;
  const card = item?.card ?? item?.mine;
  const answers = card?.a?.length ? card.a : null;
  const knownCount = items.filter(known).length;
  const answer = item && typed.key === item.key ? typed : null;
  const result: ItemResult | null = ui.flip ? (answer?.result ?? {}) : null;

  const go = (i: number) => {
    setTyped({ key: '', value: '', result: null });
    setNudge(false);
    setUi({ ...ui, i, flip: false });
  };

  const flip = () => {
    // Typed cards turn over by checking an answer, and stay turned until rated.
    if (answers) return;
    setUi({ ...ui, i: index, flip: !ui.flip });
  };

  const check = (value: string, giveUp: boolean) => {
    if (!item || !answers) return;
    if (!giveUp && !value.trim()) {
      setNudge(true);
      return;
    }
    setNudge(false);
    const ok = giveUp ? false : checkTyped(answers, value);
    setTyped({ key: item.key, value, result: { answer: value, ok } });
    setUi({ ...ui, i: index, flip: true });
  };

  const onRate = (grade: SrsGrade) => {
    if (!item || !result) return;
    update((draft) => {
      rate(draft, item, grade, Date.now(), prefs, {
        answer: result.answer,
        ok: result.ok,
      });
    });
    // With the filter on, a card rated Hard or better leaves the list, so the next one slides in.
    go(!ui.only || grade === 1 ? Math.min(index + 1, list.length - 1) : index);
  };

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        (event.target instanceof HTMLElement &&
          event.target.closest('[role="dialog"]'))
      )
        return;
      if (ui.flip && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        onRate(Number(event.key) as SrsGrade);
        return;
      }
      if (event.key !== ' ' || answers || isControlTarget(event.target)) return;
      event.preventDefault();
      flip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const memory = item && now ? memoryOf(item, state, prefs, now).mem : null;
  const preview =
    item && ui.flip && prefs.showIntervals && now
      ? intervalPreview(item, state, prefs, now)
      : null;

  const face = item && card && (
    <div className="fc-side" key={`${item.key}-${ui.flip}`}>
      {ui.flip ? (
        <>
          <div className="fc-lbl">Answer</div>
          <Html className="fc-b" html={card.b} math={course.math} />
        </>
      ) : (
        <>
          <div className="fc-lbl">
            {known(item) ? 'Known' : 'Card'} {index + 1} of {list.length}
          </div>
          <Html className="fc-f" html={card.f} math={course.math} />
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="sethead">
        <p>
          {title}. Flip each card (click or Space), then rate how well you knew
          it: 1 Again, 2 Hard, 3 Good, 4 Easy.
        </p>
        <Tally got={knownCount} of={items.length} noun="known" />
      </div>
      <label className="onlyu">
        <input
          type="checkbox"
          checked={ui.only}
          onChange={(event) => {
            setTyped({ key: '', value: '', result: null });
            setUi({ i: 0, flip: false, only: event.target.checked });
          }}
        />
        Only cards I don&apos;t know yet
      </label>
      {item && card ? (
        <>
          {answers ? (
            <div className={cn('fc w-full deck-typed', ui.flip && 'flipped')}>
              {face}
            </div>
          ) : (
            <button
              type="button"
              className={cn('fc w-full', ui.flip && 'flipped')}
              aria-label={`Flashcard ${index + 1} of ${list.length}, ${ui.flip ? 'back' : 'front'}. Press Enter to flip.`}
              onClick={flip}
            >
              {face}
            </button>
          )}
          {answers && (!ui.flip || answer?.result) && (
            <div className="deck-answer">
              <AnswerInput
                key={item.key}
                label="Your answer"
                mono={Boolean(course.codeLang)}
                value={answer?.value ?? ''}
                onChange={(value) => {
                  setNudge(false);
                  setTyped({ key: item.key, value, result: null });
                }}
                onCheck={() => check(answer?.value ?? '', false)}
                status={answer?.result ? Boolean(answer.result.ok) : null}
              />
              <div
                className={cn(
                  'fb',
                  !nudge && answer?.result && (answer.result.ok ? 'ok' : 'bad'),
                )}
                aria-live="polite"
              >
                {nudge
                  ? 'Type an answer first.'
                  : answer?.result
                    ? answer.result.ok
                      ? 'Correct'
                      : `Not quite. Accepted: ${answers[0]}`
                    : ''}
              </div>
              {!ui.flip && (
                <button
                  type="button"
                  className="textlink"
                  onClick={() => check(answer?.value ?? '', true)}
                >
                  I don&apos;t know, show the answer
                </button>
              )}
            </div>
          )}
          <div className="sr" aria-live="polite">
            {ui.flip ? `Answer: ${stripHtml(card.b)}` : ''}
          </div>
          {ui.flip && (
            <RatingBar
              preview={preview}
              suggested={suggestedGrade(result)}
              onRate={onRate}
            />
          )}
          {memory && (
            <p className="deck-next">
              {memory.sus
                ? 'Suspended from reviews.'
                : memory.due <= now
                  ? 'Due for review now.'
                  : `Next review in ${formatInterval(memory.due - now)}.`}
            </p>
          )}
          <div className="fc-bar">
            <button
              type="button"
              className="pill"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              Previous
            </button>
            <span className="sp" />
            <button
              type="button"
              className="pill"
              disabled={index >= list.length - 1}
              onClick={() => go(index + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <div className="emptystate">
          {items.length
            ? 'You know every card here. Uncheck the filter to review them all.'
            : 'This week has no flashcards yet.'}
        </div>
      )}
    </>
  );
}
