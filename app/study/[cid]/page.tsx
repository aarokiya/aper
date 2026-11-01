import Link from 'next/link';
import {
  classGrades,
  gradeText,
  latestAnnouncement,
  openAssignments,
} from '@/components/study/canvas';
import { CourseCatchUp } from '@/components/study/behind';
import { catchUpCourse } from '@/components/study/catch-up';
import { CourseLede, StudyTools } from '@/components/study/course-home';
import { clientCourse, weekName } from '@/components/study/format';
import { loadStudyPage } from '@/components/study/load';
import { Materials } from '@/components/study/materials';
import { TabPills } from '@/components/study/overview';
import { curWeek, weekByNumber } from '@/lib/study/model';
import { canvasCourseFor, outlineCourse, studyDueCounts } from '@/lib/study/nav';
import { getStudyPrefs } from '@/lib/study/prefs';

export const dynamic = 'force-dynamic';

export default async function StudyCourseHomePage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { course, state, today } = await loadStudyPage(params);
  const canvasId = canvasCourseFor(course.code);
  const outline = outlineCourse(course, canvasId);
  const current = curWeek(course.weeks, today);
  const week = weekByNumber(course, current);
  const due = canvasId === null ? [] : openAssignments([canvasId], 4);
  const grade =
    canvasId === null ? null : gradeText(classGrades().get(canvasId));
  const announcement = canvasId === null ? null : latestAnnouncement(canvasId);
  const cards = studyDueCounts([{ course, state }], getStudyPrefs())[course.id];

  return (
    <div className="wrap home">
      <div className="dateline">{course.who}</div>
      <h2>
        {course.code}: {course.name}
      </h2>
      <CourseLede
        outline={outline}
        initial={state}
        today={today}
        week={current}
      />

      {week && (
        <div className="cont">
          <h3>
            {weekName(week)}: {week.title}
          </h3>
          <TabPills course={clientCourse(course, [week])} state={state} />
        </div>
      )}

      <CourseCatchUp
        course={catchUpCourse(course)}
        initial={state}
        today={today}
      />

      {course.missing.length > 0 && (
        <div className="missing">
          <b>Missing data for this course.</b> Add these to the Study Hub and
          import it again:
          <ul>
            {course.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {canvasId !== null && (
        <>
          <h3 className="grp">From Canvas</h3>
          <div className="canvas-block">
            <dl>
              <dt>Current grade</dt>
              <dd>
                <Link
                  href="/grades"
                  className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
                >
                  {grade ?? 'No grade yet'}
                </Link>
              </dd>
              <dt>Due next</dt>
              <dd>
                {due.length ? (
                  <ul>
                    {due.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4"
                      >
                        <Link
                          href={`/assignments/${item.id}`}
                          className="min-w-0 underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
                        >
                          {item.title}
                        </Link>
                        <span className="when">{item.due}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-ink-3">Nothing open right now.</span>
                )}
              </dd>
              {announcement && (
                <>
                  <dt>Latest announcement</dt>
                  <dd className="flex flex-wrap items-baseline justify-between gap-x-4">
                    {announcement.url ? (
                      <a
                        href={announcement.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {announcement.title}
                      </a>
                    ) : (
                      <span>{announcement.title}</span>
                    )}
                    {announcement.posted && (
                      <span className="when">{announcement.posted}</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
            <div className="foot">
              <Link href={`/courses/${canvasId}`} className="textlink">
                Open the Canvas course page
              </Link>
            </div>
          </div>
        </>
      )}

      {course.materials.length > 0 && (
        <>
          <h3 className="grp">Where to find your materials</h3>
          <Materials groups={course.materials} />
        </>
      )}

      <h3 className="grp t2">Study tools</h3>
      <StudyTools
        outline={outline}
        initial={state}
        cardsDue={cards.due + cards.learning}
      />
    </div>
  );
}
