'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import type { CondensedPart } from '@/lib/study/condense';
import { fmtDay, tabsFor, topicStatus } from '@/lib/study/model';
import { useStudyPrefs } from '@/lib/study/prefs-client';
import { coursePrefs, type StudyPrefs } from '@/lib/study/prefs-schema';
import { useStudyProgress } from '@/lib/study/progress-client';
import { cardItem } from '@/lib/study/srs';
import type { StudyCourse, StudyCourseState } from '@/lib/study/types';
import { CardDeck } from './card-deck';
import { ExamPane } from './exam-pane';
import { weekHref } from './format';
import { LecturePane } from './lecture-pane';
import { CheckMark } from './marks';
import { ParsonsPane } from './parsons-pane';
import { PracticePane } from './practice-pane';
import { StudioPane } from './studio-pane';

const EXAM_EVENT = /exam|midterm|final/i;
const NOT_EXAM_EVENT = /released|due|wrapper/i;

const inField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
    target.isContentEditable);

/**
 * A week page (artifact renderWeek): heading, schedule, and the
 * Lecture/Practice/Studio/Cards/Arrange/exam tabs. The tab lives in `?tab=`
 * and is switched in place (no history entry, like the artifact); without
 * `?tab=` the course's default tab opens. Tabs hidden in the study prefs are
 * left out unless `?tab=` names them. ArrowLeft and ArrowRight move to the
 * previous or next week when focus is not in a field.
 */
export function WeekView({
  course,
  initial,
  prefs: initialPrefs,
  condensed,
  relation,
  today,
  prev,
  next,
}: {
  /** the course with only this week (see clientCourse) */
  course: StudyCourse;
  initial: StudyCourseState;
  prefs: StudyPrefs;
  /** the week's notes condensed per lecture and part (see condenseWeek) */
  condensed: CondensedPart[][];
  relation: 'this week' | 'past' | 'coming up';
  /** local YYYY-MM-DD, for the complete/behind banner */
  today: string;
  prev: number | null;
  next: number | null;
}) {
  const week = course.weeks[0];
  const { state, update } = useStudyProgress(course.id, initial);
  const [prefs, updatePrefs] = useStudyPrefs(initialPrefs);
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const options = coursePrefs(prefs, course.id);
  const requested = params.get('tab');
  const allTabs = tabsFor(course, state, week);
  const visible = allTabs.filter(
    (item) => !options.hiddenTabs.includes(item.id),
  );
  const base = visible.length ? visible : allTabs.slice(0, 1);
  // The tab opened without `?tab=`: the course default when shown, else the lecture.
  const fallback =
    base.find((item) => item.id === options.defaultTab)?.id ??
    base.find((item) => item.id === 'lecture')?.id ??
    base[0].id;
  const tab = allTabs.some((item) => item.id === requested)
    ? (requested as string)
    : fallback;
  const tabs = allTabs.filter(
    (item) => item.id === tab || base.includes(item),
  );
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = useCallback(
    (id: string, focus = false) => {
      window.history.replaceState(
        null,
        '',
        id === fallback
          ? pathname
          : `${pathname}?tab=${encodeURIComponent(id)}`,
      );
      if (focus) tabRefs.current[id]?.focus();
      else window.scrollTo(0, 0);
    },
    [fallback, pathname],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      )
        return;
      if (inField(event.target)) return;
      const target = event.key === 'ArrowLeft' ? prev : next;
      if (target === null) return;
      event.preventDefault();
      router.push(weekHref(course.id, target));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [course.id, next, prev, router]);

  // Review-queue "Retry" links carry #p<n>-<i> / #s<n>-<i>: bring that item to the middle.
  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      window.requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ block: 'center' }),
      );
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [tab]);

  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const target = tabs[(moves[event.key] + tabs.length) % tabs.length];
    select(target.id, true);
  };

  const exam = tab.startsWith('x-') ? course.exams[tab.slice(2)] : undefined;
  const pane = {
    course,
    week,
    state,
    update,
    prefs,
    onTab: (id: string) => select(id),
  };

  const status = topicStatus(course.labels, state, week, today);

  return (
    <div className="wrap">
      <div className="whead">
        <div className="kicker">
          {course.code},{' '}
          {week.label === String(week.n)
            ? `week ${week.n}`
            : `${week.label.toLowerCase()} week`}
          , {relation}
        </div>
        <h2>{week.title}</h2>
        <div className="sub">
          {fmtDay(week.start)} to {fmtDay(week.end)}. <b>{week.secs}</b>
        </div>
      </div>
      {status.complete && (
        <div className="wst done">
          <CheckMark decorative />
          <span>
            <b>Topic complete.</b> You&apos;ve finished every lecture,
            practice, and studio item this week.
          </span>
        </div>
      )}
      {status.behind && (
        <div className="wst behind">
          <b>You&apos;re behind on this week.</b> It ended {fmtDay(week.end)}.
          Still to do:{' '}
          {status.miss.map((item, i) => (
            <Fragment key={item.text}>
              {i > 0 && ', '}
              <button
                type="button"
                className="textlink"
                onClick={() => select(item.tab)}
              >
                {item.text}
              </button>
            </Fragment>
          ))}
          .
        </div>
      )}
      {week.events.length > 0 && (
        <div className="events" aria-label="Schedule">
          {week.events.map(([date, text], i) => (
            <span key={`${i}-${date}`}>
              <em>{date}</em>
              <span
                className={
                  EXAM_EVENT.test(text) && !NOT_EXAM_EVENT.test(text)
                    ? 'xm'
                    : undefined
                }
              >
                {text}
              </span>
            </span>
          ))}
        </div>
      )}
      <div
        className="tabs"
        role="tablist"
        aria-label={`${course.code} week ${week.n}`}
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[item.id] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={item.id === tab}
            aria-controls="week-pane"
            tabIndex={item.id === tab ? 0 : -1}
            onClick={() => select(item.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {item.label}
            {item.count && (
              <span className="c">
                <span aria-hidden="true">{item.count}</span>
                <span className="sr">
                  , {item.count.replace('/', ' of ')} done
                </span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        className="sheet"
        role="tabpanel"
        id="week-pane"
        aria-labelledby={`tab-${tab}`}
        key={tab}
      >
        {tab === 'lecture' && (
          <LecturePane
            {...pane}
            condensed={condensed}
            updatePrefs={updatePrefs}
          />
        )}
        {tab === 'practice' && <PracticePane {...pane} />}
        {tab === 'studio' && <StudioPane {...pane} />}
        {tab === 'cards' && (
          <CardDeck
            id={`${course.id}:w${week.n}`}
            title="This week's cards"
            items={week.cards.map((_, i) => cardItem(course, week, i))}
            course={{
              cid: course.id,
              math: course.math,
              codeLang: course.code_lang,
            }}
            state={state}
            update={update}
            prefs={prefs}
          />
        )}
        {tab === 'parsons' && <ParsonsPane {...pane} />}
        {exam && (
          <ExamPane
            course={course}
            exam={exam}
            week={week}
            state={state}
            update={update}
          />
        )}
      </div>
    </div>
  );
}
