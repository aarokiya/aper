import type { Metadata } from 'next';
import Link from 'next/link';
import {
  classGrades,
  gradeText,
  openAssignments,
} from '@/components/study/canvas';
import { CatchUpAll } from '@/components/study/behind';
import { catchUpCourse } from '@/components/study/catch-up';
import { clientCourse, plural } from '@/components/study/format';
import { Materials } from '@/components/study/materials';
import {
  ComingUp,
  DailyReviewSummary,
  ThisWeekRow,
  type UpcomingCourse,
} from '@/components/study/overview';
import { loadStudyHub } from '@/lib/study/hub';
import {
  curWeek,
  d8,
  examWeek,
  localDayKey,
  weekByNumber,
} from '@/lib/study/model';
import {
  canvasCourseFor,
  canvasCourseTitle,
  currentClasses,
  displayCode,
  studyDueCounts,
} from '@/lib/study/nav';
import { getStudyPrefs } from '@/lib/study/prefs';
import { getStudyProgress } from '@/lib/study/progress';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Study' };

const NUMBER_WORDS: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
};

/** Heading from the hub title: a "Season YYYY" term if present ("Spring 2027 hub" → "Spring 2027"), else the title minus "study hub", else "Study". */
function termOf(title: string | undefined) {
  const term = title?.match(/\b(Fall|Spring|Summer|Winter)\s+\d{4}\b/i)?.[0];
  return term ?? title?.replace(/\s*study hub\s*$/i, '') ?? 'Study';
}

export default function StudyOverviewPage() {
  const hub = loadStudyHub();
  const today = localDayKey();
  const classes = currentClasses();
  const grades = classGrades();
  const courses = (hub?.courses ?? []).map((course) => ({
    course,
    state: getStudyProgress(course.id),
    canvasId: canvasCourseFor(course.code, classes),
  }));
  const matched = new Set(
    courses.flatMap(({ canvasId }) => (canvasId === null ? [] : [canvasId])),
  );
  const others = classes.filter((item) => !matched.has(item.id));
  const due = openAssignments([...matched], 6);
  const dateline = d8(today).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const upcoming: UpcomingCourse[] = courses.map(({ course, state }) => ({
    id: course.id,
    code: course.code,
    initial: state,
    exams: Object.values(course.exams).map(({ id, title, date, dateEst }) => ({
      id,
      title,
      date,
      dateEst,
    })),
    examWeeks: Object.fromEntries(
      Object.keys(course.exams).flatMap((id) => {
        const week = examWeek(course.weeks, id);
        return week ? [[id, week.n]] : [];
      }),
    ),
  }));
  const reviewCounts = studyDueCounts(courses, getStudyPrefs());

  const otherClasses = others.length > 0 && (
    <ul className="uplist classes">
      {others.map((item) => (
        <li key={item.id}>
          <Link href={`/courses/${item.id}`}>
            <span className="uc">
              {item.alias ?? displayCode(item.code ?? item.name)}
            </span>
            <span className="ut">{canvasCourseTitle(item.name)}</span>
            <span className="uw">
              {gradeText(grades.get(item.id)) ?? 'No grade yet'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="study-main top">
      <div className="wrap home">
        <div className="dateline">{dateline}</div>
        <h2>{termOf(hub?.title)}</h2>
        {hub ? (
          <>
            <p className="lede">
              {NUMBER_WORDS[courses.length] ?? courses.length}{' '}
              {courses.length === 1 ? 'course' : 'courses'}, one place. Pick up
              where you left off, or open a course from the sidebar.
            </p>

            <h3 className="grp">Daily review</h3>
            <DailyReviewSummary
              courses={courses.map(({ course }) => {
                const count = reviewCounts[course.id];
                return {
                  id: course.id,
                  code: course.code,
                  name: course.name,
                  due: count.due + count.learning,
                  newAvail: count.newAvail,
                  review: count.review,
                };
              })}
            />

            <h3 className="grp t2">Coming up</h3>
            <ComingUp courses={upcoming} today={today} />

            <h3 className="grp t2">Catch up</h3>
            <CatchUpAll
              courses={courses.map(({ course, state }) => ({
                ...catchUpCourse(course),
                initial: state,
              }))}
              today={today}
            />

            <h3 className="grp t2">This week</h3>
            <ul className="wklist">
              {courses.map(({ course, state }) => {
                const week = weekByNumber(course, curWeek(course.weeks, today));
                return week ? (
                  <ThisWeekRow
                    key={course.id}
                    course={clientCourse(course, [week])}
                    initial={state}
                    today={today}
                  />
                ) : null;
              })}
            </ul>

            {matched.size > 0 && (
              <>
                <h3 className="grp t2">Due soon on Canvas</h3>
                {due.length ? (
                  <ul className="uplist">
                    {due.map((item) => (
                      <li key={item.id}>
                        <Link href={`/assignments/${item.id}`}>
                          <span className="ud">
                            {item.days === 0
                              ? 'Today'
                              : plural(item.days, 'day')}
                          </span>
                          <span className="uc">{displayCode(item.course)}</span>
                          <span className="ut">{item.title}</span>
                          <span className="uw">{item.due}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="emptystate">
                    Nothing open on Canvas for these courses.
                  </p>
                )}
              </>
            )}

            {otherClasses && (
              <>
                <h3 className="grp t2">Also this term</h3>
                {otherClasses}
              </>
            )}

            <h3 className="grp t2">Materials</h3>
            {courses.map(({ course }, index) => (
              <details key={course.id} className="mat" open={index === 0}>
                <summary>
                  {course.code}: {course.name}
                </summary>
                <Materials groups={course.materials} />
              </details>
            ))}
          </>
        ) : (
          <>
            <p className="lede">
              Import your Study Hub to get weekly lectures, practice,
              flashcards, and practice exams for each course.
            </p>
            <p className="emptystate">
              No Study Hub is imported yet. Open{' '}
              <Link
                href="/settings#study-hub"
                className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
              >
                Settings, Study Hub
              </Link>{' '}
              and upload a courses JSON (see docs/study-hub-format.md) or a hub .html file.
            </p>
            {otherClasses && (
              <>
                <h3 className="grp t2">Your classes</h3>
                {otherClasses}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
