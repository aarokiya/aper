'use client';

import { useMemo } from 'react';
import { plural } from '@/components/study/format';
import { useNow } from '@/components/study/review/clock';
import { WithProgress } from '@/components/study/with-progress';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import {
  dayLogs,
  forecast,
  stateCounts,
  streak,
  studyDay,
  userCardItems,
  type StudyItem,
} from '@/lib/study/srs';
import type { StudyCourseState } from '@/lib/study/types';

const DAY = 86_400_000;
const HISTORY_DAYS = 30;
const FORECAST_DAYS = 14;

type StatsCourse = {
  cid: string;
  code: string;
  items: StudyItem[];
  initial: StudyCourseState;
};

type Counts = {
  new: number;
  learning: number;
  review: number;
  mature: number;
  suspended: number;
};
type Log = { again: number; pass: number; introduced: number; ms: number };

type CourseStats = {
  cid: string;
  code: string;
  /** oldest first, last = today */
  history: Log[];
  forecast: number[];
  counts: Counts;
};

const STATE_ROWS: Array<[keyof Counts, string, string]> = [
  ['new', 'New', 'Not studied yet'],
  ['learning', 'Learning', 'In learning or relearning steps'],
  ['review', 'Young', 'Review interval under 21 days'],
  ['mature', 'Mature', 'Review interval of 21 days or more'],
  ['suspended', 'Suspended', 'Kept out of every queue'],
];

/** "Oct 3" for a `YYYY-MM-DD` study day shifted by `offset` days. */
function dayLabel(day: string, offset = 0) {
  return new Date(Date.parse(day) + offset * DAY).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Ratings that were Hard, Good, or Easy, over all ratings, in the last `days` days. */
function recallRate(history: Log[], days: number) {
  let pass = 0;
  let total = 0;
  for (const log of history.slice(-days)) {
    pass += log.pass;
    total += log.pass + log.again;
  }
  return { pass, total, rate: total > 0 ? pass / total : null };
}

const percent = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;

/** Flashcards → Stats: today, streak, recall rate, review history, due forecast, and item states. */
export function StatsView({
  courses,
  prefs,
}: {
  courses: StatsCourse[];
  prefs: StudyPrefs;
}) {
  const seeds = useMemo(
    () => courses.map((course) => ({ id: course.cid, initial: course.initial })),
    [courses],
  );
  return (
    <WithProgress seeds={seeds}>
      {(states) => <StatsBody courses={courses} states={states} prefs={prefs} />}
    </WithProgress>
  );
}

function StatsBody({
  courses,
  states,
  prefs,
}: {
  courses: StatsCourse[];
  states: StudyCourseState[];
  prefs: StudyPrefs;
}) {
  const now = useNow();
  // Stats move with progress or once a minute, not every clock tick.
  const minute = Math.floor(now / 60_000) * 60_000;

  const stats = useMemo<CourseStats[] | null>(() => {
    if (!minute) return null;
    return courses.map((course, i) => {
      const state = states[i];
      const items = [...course.items, ...userCardItems(course.cid, state.uc)];
      return {
        cid: course.cid,
        code: course.code,
        history: dayLogs(state, prefs, minute, HISTORY_DAYS).map((log) => ({
          again: log.again,
          pass: log.hard + log.good + log.easy,
          introduced: log.introduced,
          ms: log.ms,
        })),
        forecast: forecast({
          items,
          state,
          prefs,
          now: minute,
          days: FORECAST_DAYS,
        }),
        counts: stateCounts({ items, state, prefs, now: minute }),
      };
    });
  }, [courses, states, prefs, minute]);

  if (!stats) {
    return (
      <p className="ca-empty" aria-live="polite">
        Loading stats…
      </p>
    );
  }

  const today = studyDay(minute, prefs.dayStartsAt);
  const history: Log[] = Array.from({ length: HISTORY_DAYS }, (_, d) => {
    const sum = { again: 0, pass: 0, introduced: 0, ms: 0 };
    for (const course of stats) {
      const log = course.history[d];
      sum.again += log.again;
      sum.pass += log.pass;
      sum.introduced += log.introduced;
      sum.ms += log.ms;
    }
    return sum;
  });
  const due = Array.from({ length: FORECAST_DAYS }, (_, d) =>
    stats.reduce((total, course) => total + course.forecast[d], 0),
  );
  const counts: Counts = {
    new: 0,
    learning: 0,
    review: 0,
    mature: 0,
    suspended: 0,
  };
  for (const course of stats)
    for (const [key] of STATE_ROWS) counts[key] += course.counts[key];
  const totalItems = STATE_ROWS.reduce((sum, [key]) => sum + counts[key], 0);

  const todayLog = history[HISTORY_DAYS - 1];
  const reviewedToday = Math.max(
    0,
    todayLog.again + todayLog.pass - todayLog.introduced,
  );
  const week = recallRate(history, 7);
  const month = recallRate(history, HISTORY_DAYS);
  const days = streak(states, prefs, minute);
  const historyMax = Math.max(1, ...history.map((log) => log.again + log.pass));
  const dueMax = Math.max(1, ...due);

  return (
    <section className="ca ca-stats" aria-label="Review stats">
      <dl className="ca-figs">
        <div>
          <dt>Today</dt>
          <dd>
            <b>{reviewedToday}</b> reviewed
            <span>
              {todayLog.introduced} new · {Math.round(todayLog.ms / 60_000)}{' '}
              min
            </span>
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            <b>{days}</b> {days === 1 ? 'day' : 'days'}
            <span>days in a row with a review</span>
          </dd>
        </div>
        <div>
          <dt>Recall rate, 7 days</dt>
          <dd>
            <b>{percent(week.rate)}</b>
            <span>
              {week.pass} of {plural(week.total, 'rating')}
            </span>
          </dd>
        </div>
        <div>
          <dt>Recall rate, 30 days</dt>
          <dd>
            <b>{percent(month.rate)}</b>
            <span>
              {month.pass} of {plural(month.total, 'rating')}
            </span>
          </dd>
        </div>
      </dl>
      <p className="ca-hint">
        Recall rate is the share of ratings that were Hard, Good, or Easy rather
        than Again. It includes first answers to new items, so it runs a little
        below your true retention of reviewed items (target{' '}
        {Math.round(prefs.retention * 100)}%).
      </p>

      <h3 className="ca-h">Reviews, last 30 days</h3>
      <BarChart
        label="Ratings per day, last 30 days"
        max={historyMax}
        bars={history.map((log, d) => ({
          key: String(d),
          parts: [
            { value: log.pass, tone: 'ink' },
            { value: log.again, tone: 'bad' },
          ],
          text: `${dayLabel(today, d - HISTORY_DAYS + 1)}: ${plural(log.again + log.pass, 'rating')}${log.again ? `, ${log.again} again` : ''}`,
        }))}
        first={dayLabel(today, 1 - HISTORY_DAYS)}
        last="Today"
      />
      <p className="ca-legend">
        <span className="ca-key ink" aria-hidden="true" /> Hard, Good, Easy
        <span className="ca-key bad" aria-hidden="true" /> Again
      </p>

      <h3 className="ca-h">Due, next 14 days</h3>
      <BarChart
        label="Reviews due per day, next 14 days"
        max={dueMax}
        bars={due.map((count, d) => ({
          key: String(d),
          parts: [{ value: count, tone: 'gray' }],
          text: `${d === 0 ? 'Today (with overdue)' : dayLabel(today, d)}: ${count} due`,
        }))}
        first="Today"
        last={dayLabel(today, FORECAST_DAYS - 1)}
      />

      <h3 className="ca-h">Items by state</h3>
      {totalItems > 0 ? (
        <div className="ca-split" aria-hidden="true">
          {STATE_ROWS.map(([key]) =>
            counts[key] > 0 ? (
              <span
                key={key}
                className={`ca-split-${key}`}
                style={{ flexGrow: counts[key] }}
              />
            ) : null,
          )}
        </div>
      ) : null}
      <div className="tbl-wrap">
        <table className="ca-table">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col" className="num">
                Items
              </th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {STATE_ROWS.map(([key, label, meaning]) => (
              <tr key={key}>
                <td>
                  <span
                    className={`ca-key ca-split-${key}`}
                    aria-hidden="true"
                  />{' '}
                  {label}
                </td>
                <td className="num">{counts[key]}</td>
                <td className="ca-meta">{meaning}</td>
              </tr>
            ))}
            <tr>
              <td>Total</td>
              <td className="num">{totalItems}</td>
              <td className="ca-meta">Every item in these courses</td>
            </tr>
          </tbody>
        </table>
      </div>

      {stats.length > 1 ? (
        <>
          <h3 className="ca-h">By course</h3>
          <div className="tbl-wrap">
            <table className="ca-table">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col" className="num">
                    Reviewed today
                  </th>
                  <th scope="col" className="num">
                    Due today
                  </th>
                  <th scope="col" className="num">
                    Recall 7d
                  </th>
                  <th scope="col" className="num">
                    Recall 30d
                  </th>
                  {STATE_ROWS.map(([key, label]) => (
                    <th key={key} scope="col" className="num">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((course) => {
                  const last = course.history[HISTORY_DAYS - 1];
                  return (
                    <tr key={course.cid}>
                      <th scope="row">{course.code}</th>
                      <td className="num">
                        {Math.max(0, last.again + last.pass - last.introduced)}
                      </td>
                      <td className="num">{course.forecast[0]}</td>
                      <td className="num">
                        {percent(recallRate(course.history, 7).rate)}
                      </td>
                      <td className="num">
                        {percent(recallRate(course.history, HISTORY_DAYS).rate)}
                      </td>
                      {STATE_ROWS.map(([key]) => (
                        <td key={key} className="num">
                          {course.counts[key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Plain CSS bars, each a stack of parts; every bar carries its numbers as screen-reader text. */
function BarChart({
  label,
  max,
  bars,
  first,
  last,
}: {
  label: string;
  max: number;
  bars: Array<{
    key: string;
    parts: Array<{ value: number; tone: 'ink' | 'gray' | 'bad' }>;
    text: string;
  }>;
  first: string;
  last: string;
}) {
  return (
    <figure className="ca-chart">
      <div className="ca-chart-max" aria-hidden="true">
        {max}
      </div>
      <ol className="ca-bars" aria-label={label}>
        {bars.map((bar) => (
          <li key={bar.key} title={bar.text}>
            <span className="sr">{bar.text}</span>
            {bar.parts.map((part, i) =>
              part.value > 0 ? (
                <span
                  key={i}
                  className={`ca-bar ${part.tone}`}
                  style={{ height: `${(part.value / max) * 100}%` }}
                  aria-hidden="true"
                />
              ) : null,
            )}
          </li>
        ))}
      </ol>
      <figcaption className="ca-chart-axis" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
