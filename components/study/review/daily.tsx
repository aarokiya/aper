'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { StatsView } from '@/components/study/flashcards/stats';
import {
  PresetList,
  SessionBuilder,
  type CourseInput,
} from '@/components/study/flashcards/session-builder';
import { ReviewSession } from '@/components/study/review/session';
import { WithProgress } from '@/components/study/with-progress';
import { useStudyPrefs } from '@/lib/study/prefs-client';
import {
  coursePrefs,
  type CustomSession,
  type StudyPrefs,
} from '@/lib/study/prefs-schema';
import {
  buildCustomQueue,
  buildDailyQueue,
  dailyCounts,
  forecast,
  nextDayStart,
  streak,
  userCardItems,
  type DailyCourseCounts,
  type QueueEntry,
  type StudyItem,
} from '@/lib/study/srs';
import type { StudyCourseState } from '@/lib/study/types';

/** A course as the review pages get it from the server. */
export type ReviewCourse = {
  cid: string;
  code: string;
  name: string;
  math: boolean;
  codeLang?: string;
  initial: StudyCourseState;
  /** content items (courseItems); the student's own cards are added from live state */
  items: StudyItem[];
  weeks: Array<{
    n: number;
    label: string;
    title: string;
    start: string;
    end: string;
    exams: string[];
  }>;
  exams: Array<{ id: string; title: string }>;
  /** current week number */
  current: number;
};

/** A session being studied; `key` remounts ReviewSession for each start. */
export type ActiveSession = {
  key: number;
  title: string;
  entries: QueueEntry[];
  reschedule: boolean;
};

const DAY = 86_400_000;
const FORECAST_DAYS = 365;

/** `now` that starts at the server's render time (so markup hydrates) and then follows the clock each minute. */
export function useClock(serverNow: number): [number, () => void] {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return [now, () => setNow(Date.now())];
}

const inputCache = new WeakMap<StudyCourseState, CourseInput>();

/** Queue input for a course: content items plus the student's cards from this live state (cached per state object). */
export function courseInput(
  course: ReviewCourse,
  state: StudyCourseState,
): CourseInput {
  const cached = inputCache.get(state);
  if (cached && cached.cid === course.cid) return cached;
  const input = {
    cid: course.cid,
    items: [...course.items, ...userCardItems(course.cid, state.uc, course.weeks)],
    state,
  };
  inputCache.set(state, input);
  return input;
}

/** "tomorrow (12 reviews)", "Thursday, Oct 22 (5 reviews)", or null when nothing is scheduled. */
export function nextDue(
  inputs: CourseInput[],
  prefs: StudyPrefs,
  now: number,
): string | null {
  const days = Array.from({ length: FORECAST_DAYS }, () => 0);
  for (const input of inputs)
    forecast({ ...input, prefs, now, days: FORECAST_DAYS }).forEach(
      (count, index) => {
        days[index] += count;
      },
    );
  const index = days.findIndex((count, i) => i > 0 && count > 0);
  if (index < 0) return null;
  const count = `${days[index]} ${days[index] === 1 ? 'review' : 'reviews'}`;
  if (index === 1) return `tomorrow (${count})`;
  // Noon of that study day, clear of the day boundary and DST shifts.
  const day = new Date(
    nextDayStart(now, prefs.dayStartsAt) + (index - 1) * DAY + DAY / 2,
  );
  return `${day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })} (${count})`;
}

/** Today's counts per course; with `links`, rows link to each course's Flashcards page. */
export function CountsTable({
  courses,
  counts,
  links = true,
}: {
  courses: ReviewCourse[];
  counts: Record<string, DailyCourseCounts>;
  links?: boolean;
}) {
  return (
    <div className="tbl-wrap">
      <table className="dr-tbl">
        <thead>
          <tr>
            <th scope="col">Course</th>
            <th scope="col">Due</th>
            <th scope="col">Learning</th>
            <th scope="col">New</th>
            <th scope="col">Done today</th>
            {links && (
              <th scope="col">
                <span className="sr">Flashcards</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => {
            const row = counts[course.cid];
            return (
              <tr key={course.cid}>
                <th scope="row">
                  <b>{course.code}</b>
                  <span>{course.name}</span>
                </th>
                <td>{row?.due ?? 0}</td>
                <td>{row?.learning ?? 0}</td>
                <td>{row?.newAvail ?? 0}</td>
                <td>{(row?.reviewedToday ?? 0) + (row?.introducedToday ?? 0)}</td>
                {links && (
                  <td>
                    <Link
                      href={`/study/${course.cid}/cards`}
                      aria-label={`${course.code} flashcards`}
                    >
                      Flashcards
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The day's review across courses, custom sessions with saved presets, and stats. */
export function DailyReview({
  courses,
  prefs,
  now,
}: {
  courses: ReviewCourse[];
  prefs: StudyPrefs;
  /** server render time (ms) */
  now: number;
}) {
  const seeds = useMemo(
    () => courses.map((course) => ({ id: course.cid, initial: course.initial })),
    [courses],
  );
  return (
    <WithProgress seeds={seeds}>
      {(states) => (
        <DailyBody courses={courses} states={states} initialPrefs={prefs} serverNow={now} />
      )}
    </WithProgress>
  );
}

function DailyBody({
  courses,
  states,
  initialPrefs,
  serverNow,
}: {
  courses: ReviewCourse[];
  states: StudyCourseState[];
  initialPrefs: StudyPrefs;
  serverNow: number;
}) {
  const router = useRouter();
  const [prefs, updatePrefs] = useStudyPrefs(initialPrefs);
  const [now, refreshNow] = useClock(serverNow);
  const [active, setActive] = useState<ActiveSession | null>(null);

  const inputs = useMemo(
    () => courses.map((course, i) => courseInput(course, states[i])),
    [courses, states],
  );
  const included = courses.filter(
    (course) => coursePrefs(prefs, course.cid).review,
  );
  const left = courses.filter((course) => !coursePrefs(prefs, course.cid).review);
  const includedInputs = inputs.filter((input) =>
    included.some((course) => course.cid === input.cid),
  );
  const counts = dailyCounts({ courses: inputs, prefs, now });
  const queued = included.reduce((sum, course) => {
    const row = counts[course.cid];
    return row ? sum + row.due + row.learning + row.newAvail : sum;
  }, 0);
  const codes = Object.fromEntries(
    courses.map((course) => [course.cid, course.code]),
  );
  const days = streak(states, prefs, now);
  const dateline = new Date(now).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const start = (session: Omit<ActiveSession, 'key'>) => {
    if (!session.entries.length) {
      refreshNow();
      return;
    }
    setActive({ ...session, key: Date.now() });
    window.scrollTo(0, 0);
  };
  const startCustom = (session: CustomSession) =>
    start({
      title: 'Custom session',
      entries: buildCustomQueue({
        courses: inputs,
        prefs,
        now: Date.now(),
        session,
        seed: Date.now().toString(),
      }),
      reschedule: session.reschedule,
    });

  if (active)
    return (
      <div className="study-main top">
        <div className="wrap daily">
          <ReviewSession
            key={active.key}
            courses={courses.map((course, i) => ({
              cid: course.cid,
              code: course.code,
              math: course.math,
              codeLang: course.codeLang,
              initial: states[i],
              items: course.items,
            }))}
            entries={active.entries}
            prefs={prefs}
            reschedule={active.reschedule}
            title={active.title}
            onExit={() => {
              setActive(null);
              refreshNow();
              router.refresh();
            }}
          />
        </div>
      </div>
    );

  const next = queued === 0 ? nextDue(includedInputs, prefs, now) : null;

  return (
    <div className="study-main top">
      <div className="wrap home daily">
        <div className="dateline">
          {dateline} ·{' '}
          {days > 0
            ? `${days}-day streak`
            : 'No streak yet. Review today to start one.'}
        </div>
        <h2>Daily review</h2>
        <p className="lede">
          Short, spaced reviews of every course, mixed together. Rate how well
          you remembered and each item comes back just before you would forget
          it. <Link href="/settings#study">Study settings</Link>
        </p>

        {included.length ? (
          <>
            <CountsTable courses={included} counts={counts} />
            <div className="dr-go">
              {queued > 0 ? (
                <button
                  type="button"
                  className="pill pill-primary"
                  onClick={() =>
                    start({
                      title: 'Daily review',
                      entries: buildDailyQueue({
                        courses: inputs,
                        prefs,
                        now: Date.now(),
                      }),
                      reschedule: true,
                    })
                  }
                >
                  Start review ({queued})
                </button>
              ) : (
                <p className="dr-done">
                  <b>All caught up.</b>{' '}
                  {next
                    ? `Next reviews are due ${next}.`
                    : 'No reviews are scheduled yet; new items appear as their weeks start.'}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="emptystate">
            No course is in Daily review. Turn courses on in{' '}
            <Link href="/settings#study">Study settings</Link>.
          </p>
        )}
        {left.length > 0 && included.length > 0 && (
          <p className="dr-note">
            Left out of Daily review:{' '}
            {left.map((course) => course.code).join(', ')}. Change this in{' '}
            <Link href="/settings#study">Study settings</Link>.
          </p>
        )}

        <h3 className="grp t2">Custom session</h3>
        <p className="dr-note">
          Pick courses, weeks, and kinds of items, say before an exam. Saved
          presets start in one click.
        </p>
        <h4 className="dr-sub">Presets</h4>
        <PresetList
          presets={prefs.presets}
          codes={codes}
          inputs={inputs}
          prefs={prefs}
          now={now}
          onStart={startCustom}
          onDelete={(id) =>
            updatePrefs((draft) => {
              draft.presets = draft.presets.filter((preset) => preset.id !== id);
            })
          }
        />
        <h4 className="dr-sub">New session</h4>
        <SessionBuilder
          courses={courses}
          prefs={prefs}
          inputs={inputs}
          now={now}
          onStart={startCustom}
          onSave={(session, name) =>
            updatePrefs((draft) => {
              draft.presets.push({ ...session, id: presetId(), name });
            })
          }
        />

        {included.length > 0 && (
          <>
            <h3 className="grp t2">Stats</h3>
            <StatsView
              courses={included.map((course) => ({
                cid: course.cid,
                code: course.code,
                items: course.items,
                initial: states[courses.indexOf(course)],
              }))}
              prefs={prefs}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** A short unique id for a saved preset. */
export const presetId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
