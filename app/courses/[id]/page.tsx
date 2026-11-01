import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { PageFrame } from '@/components/page-frame';
import { CourseAliasEditor } from '@/components/course-alias-editor';
import { LockMark } from '@/components/lock-mark';
import { lockNote } from '@/lib/tasks/lock';
import { CourseColorDot } from '@/components/course-color-dot';
import { classGrades } from '@/components/study/canvas';
import { getCourseDetail, getDashboardData } from '@/lib/db/queries';
import { getFileIndex } from '@/lib/files/queries';
import { canvasCourseTitle, displayCode, getStudyNav } from '@/lib/study/nav';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

const STATUS_LABEL: Record<string, string> = {
  GRADED: 'Graded',
  SUBMITTED: 'Submitted',
  PENDING_REVIEW: 'Pending review',
};

const shortDate: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function AssignmentRows({ rows, courseId }: { rows: Row[]; courseId: number }) {
  return (
    <ul className="rule-rows">
      {rows.map((item) => {
        const score = item.score == null ? null : Number(item.score);
        const points =
          item.points_possible == null ? null : Number(item.points_possible);
        const done =
          item.workflow_status === 'DONE_LOCALLY' ||
          item.provider_state === 'SUBMITTED' ||
          item.provider_state === 'GRADED';
        const status =
          score != null
            ? `${score}${points != null ? ` / ${points}` : ''}`
            : (STATUS_LABEL[String(item.provider_state)] ??
              (item.workflow_status === 'DONE_LOCALLY'
                ? 'Done locally'
                : item.workflow_status === 'IN_PROGRESS'
                  ? 'In progress'
                  : ''));
        return (
          <li key={String(item.id)}>
            <Link
              href={`/assignments/${item.id}`}
              data-course-id={courseId}
              className="group grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-4"
            >
              <span
                className={cn(
                  'numeral row-span-2 text-[1.0625rem] sm:row-span-1',
                  !item.due_at && 'text-ink-4',
                )}
              >
                {item.due_at
                  ? new Date(String(item.due_at)).toLocaleDateString(
                      undefined,
                      shortDate,
                    )
                  : '—'}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-[0.9375rem] leading-snug underline-offset-[3px] group-hover:underline',
                    done && 'text-ink-2',
                  )}
                >
                  <span className="truncate">{String(item.title)}</span>
                  <LockMark
                    note={lockNote(
                      item.locked,
                      item.lock_explanation,
                      item.unlock_at ? String(item.unlock_at) : null,
                    )}
                  />
                </span>
                {Boolean(item.due_at) && (
                  <span className="block text-[0.78125rem] text-ink-3">
                    {new Date(String(item.due_at)).toLocaleTimeString(
                      undefined,
                      { hour: 'numeric', minute: '2-digit' },
                    )}
                    {points != null && score == null ? ` · ${points} pts` : ''}
                  </span>
                )}
              </span>
              {status && (
                <span
                  className={cn(
                    'col-start-2 text-[0.8125rem] sm:col-start-auto sm:text-right',
                    score != null ? 'numeral text-[0.9375rem] text-ink' : '',
                    score == null && done ? 'text-good' : 'text-ink-3',
                  )}
                >
                  {status}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = getCourseDetail(Number(id));
  if (!data) notFound();
  const course = data.course;
  const courses = getDashboardData().courses;
  const courseId = Number(course.id);
  const studyId =
    getStudyNav().classes.find(
      (item) => item.canvasCourseId === courseId && item.studyId,
    )?.studyId ?? null;
  const officialCode = String(course.course_code ?? course.name);
  const code = course.local_alias
    ? String(course.local_alias)
    : displayCode(officialCode);

  const now = Date.now();
  const assignments = data.assignments as Row[];
  const dated = (item: Row) => new Date(String(item.due_at)).getTime();
  const upcoming = assignments.filter(
    (item) => item.due_at && dated(item) >= now,
  );
  const undated = assignments.filter((item) => !item.due_at);
  const earlier = assignments
    .filter((item) => item.due_at && dated(item) < now)
    .reverse();
  const modules = data.modules as Row[];
  const announcements = (data.announcements as Row[]).slice(0, 6);
  // The grade calculator's grade (by the syllabus when adopted), not Canvas's.
  const grade = classGrades().get(courseId);
  const score = grade
    ? grade.percent
    : course.current_score == null
      ? null
      : Number(course.current_score);
  const letter = grade
    ? grade.letter
    : course.current_grade
      ? String(course.current_grade)
      : null;
  const sourceUrl = course.source_url ? String(course.source_url) : null;

  return (
    <PageFrame
      title={canvasCourseTitle(String(course.name))}
      eyebrow={code}
      actions={
        <>
          {studyId && (
            <Link href={`/study/${studyId}`} className="pill pill-primary">
              Open study hub
            </Link>
          )}
          <CourseAliasEditor
            courseId={courseId}
            officialCode={officialCode}
            initialAlias={
              course.local_alias ? String(course.local_alias) : null
            }
          />
        </>
      }
    >
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,780px)_minmax(220px,260px)]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="assignments-title">
            <h2
              id="assignments-title"
              className="section-label mb-3 flex items-center gap-2"
            >
              <CourseColorDot
                courseId={courseId}
                courses={courses}
                className="size-2"
              />
              Assignments
              <span className="text-ink-4 tabular-nums">
                {assignments.length}
              </span>
            </h2>
            {assignments.length === 0 && (
              <p className="border-t border-rule py-4 text-[0.9375rem] text-ink-3">
                No assignments have been posted yet.
              </p>
            )}
            {upcoming.length > 0 && (
              <AssignmentRows rows={upcoming} courseId={courseId} />
            )}
            {undated.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 text-xs text-ink-3">No due date</h3>
                <AssignmentRows rows={undated} courseId={courseId} />
              </>
            )}
            {earlier.length > 0 && (
              <details className="group/earlier mt-6" open={!upcoming.length}>
                <summary className="mb-2 cursor-pointer list-none text-xs text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
                  Earlier · {earlier.length}
                  <span className="ml-1.5 group-open/earlier:hidden">+</span>
                  <span className="ml-1.5 hidden group-open/earlier:inline">
                    −
                  </span>
                </summary>
                <AssignmentRows rows={earlier} courseId={courseId} />
              </details>
            )}
          </section>

          {announcements.length > 0 && (
            <section aria-labelledby="announcements-title">
              <h2 id="announcements-title" className="section-label mb-3">
                Announcements
              </h2>
              <ul className="rule-rows">
                {announcements.map((item) => (
                  <li key={String(item.id)} className="py-4">
                    <p className="text-[0.78125rem] text-ink-3">
                      {item.posted_at
                        ? new Date(String(item.posted_at)).toLocaleDateString(
                            undefined,
                            shortDate,
                          )
                        : 'Undated'}
                      {item.author_name ? ` · ${String(item.author_name)}` : ''}
                    </p>
                    <h3 className="mt-0.5 font-serif text-[1.125rem] leading-snug font-medium">
                      {item.source_url ? (
                        <a
                          href={String(item.source_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="no-underline hover:underline"
                        >
                          {String(item.title)}
                        </a>
                      ) : (
                        String(item.title)
                      )}
                    </h3>
                    {Boolean(item.message_text) && (
                      <p className="mt-1 line-clamp-3 max-w-[68ch] font-serif text-[0.96875rem] leading-relaxed text-ink-2">
                        {String(item.message_text)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {modules.length > 0 && (
            <section aria-labelledby="modules-title">
              <h2 id="modules-title" className="section-label mb-3">
                Modules
              </h2>
              <ol className="rule-rows">
                {modules.map((item) => (
                  <li
                    key={String(item.id)}
                    className="flex items-baseline justify-between gap-4 py-2.5"
                  >
                    <span className="min-w-0 text-[0.9375rem]">
                      {String(item.title)}
                    </span>
                    <span className="shrink-0 text-[0.78125rem] text-ink-3 tabular-nums">
                      {Number(item.item_count)}{' '}
                      {Number(item.item_count) === 1 ? 'item' : 'items'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-8 lg:border-l lg:border-rule lg:pl-10">
          <section aria-labelledby="grade-title">
            <h2 id="grade-title" className="section-label">
              Current grade
            </h2>
            <p className="numeral mt-1 text-[2.5rem] leading-none">
              {letter
                ? letter
                : score != null
                  ? `${score.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
                  : '—'}
            </p>
            {letter && score != null && (
              <p className="mt-2 text-[0.8125rem] text-ink-3 tabular-nums">
                {score.toLocaleString('en-US', { maximumFractionDigits: 2 })}%
              </p>
            )}
            <Link href="/grades" className="textlink mt-3 inline-block">
              All grades
            </Link>
          </section>
          <section aria-labelledby="files-title">
            <h2 id="files-title" className="section-label">
              Files
            </h2>
            <p className="numeral mt-1 text-[1.75rem] leading-none">
              {getFileIndex().classes.find((item) => item.id === courseId)?.count ?? 0}
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-3">
              files from the Files tab and modules
            </p>
            <Link href={`/files?class=${courseId}`} className="textlink mt-3 inline-block">
              Browse this class’s files
            </Link>
          </section>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="textlink inline-flex items-center gap-1"
            >
              Open in {course.source_provider === 'gradescope' ? 'Gradescope' : 'Canvas'}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          )}
        </aside>
      </div>
    </PageFrame>
  );
}
