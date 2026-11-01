import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Lock } from 'lucide-react';
import { PageFrame } from '@/components/page-frame';
import { AssignmentActions } from '@/components/assignment-actions';
import { CourseColorDot } from '@/components/course-color-dot';
import { getAssignmentDetail, getDashboardData } from '@/lib/db/queries';
import { scorePercentage } from '@/lib/grades/score-color';
import { lockNote } from '@/lib/tasks/lock';
import { cn } from '@/lib/utils';

const SUBMISSION_LABEL: Record<string, string> = {
  UNSUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  GRADED: 'Graded',
  PENDING_REVIEW: 'Pending review',
};

type Comment = { author: string; text: string; at: string | null };
type RubricLine = {
  label: string;
  points: number | null;
  max: number | null;
  comment: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const formatWhen = (value: unknown) =>
  new Date(String(value)).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const dynamic = 'force-dynamic';

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = getAssignmentDetail(Number(id));
  if (!item) notFound();
  const parsed = (value: unknown) => {
    try {
      return value && value !== 'null' ? JSON.parse(String(value)) : null;
    } catch {
      return null;
    }
  };
  const numberOrNull = (value: unknown) => {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const score = numberOrNull(item.score);
  const pointsPossible = numberOrNull(item.points_possible);
  const grade = item.grade == null ? null : String(item.grade);
  const isGraded = String(item.provider_state) === 'GRADED';
  const percentage = scorePercentage(score, pointsPossible);
  const provider = parsed(item.provider_json) as Record<string, unknown> | null;
  const lock = lockNote(
    provider?.locked_for_user,
    provider?.lock_explanation,
    item.unlock_at ? String(item.unlock_at) : null,
  );
  const courses = getDashboardData().courses;
  const courseId = Number(item.course_id);
  const isGradescope = item.source_provider === 'gradescope';

  // Canvas submission comments: [{ author_name, comment, created_at }].
  const comments: Comment[] = (
    Array.isArray(parsed(item.comments_json)) ? parsed(item.comments_json) : []
  )
    .map(asRecord)
    .filter((entry: Record<string, unknown> | null) => entry?.comment)
    .map((entry: Record<string, unknown>) => ({
      author: String(entry.author_name ?? 'Instructor'),
      text: String(entry.comment),
      at: entry.created_at ? String(entry.created_at) : null,
    }));
  // Canvas rubric assessment: { [criterionId]: { points, comments } }, labelled
  // from the assignment's rubric criteria.
  const criteria = new Map<string, { label: string; max: number | null }>(
    (Array.isArray(parsed(item.rubric_json)) ? parsed(item.rubric_json) : [])
      .map(asRecord)
      .filter(Boolean)
      .map((criterion: Record<string, unknown>) => [
        String(criterion.id),
        {
          label: String(criterion.description ?? 'Criterion'),
          max: numberOrNull(criterion.points),
        },
      ]),
  );
  const rubric: RubricLine[] = Object.entries(
    asRecord(parsed(item.rubric_assessment_json)) ?? {},
  ).map(([criterionId, value]) => {
    const entry = asRecord(value) ?? {};
    const criterion = criteria.get(criterionId);
    return {
      label: criterion?.label ?? 'Criterion',
      points: numberOrNull(entry.points),
      max: criterion?.max ?? null,
      comment: entry.comments ? String(entry.comments) : '',
    };
  });

  const scoreTone =
    percentage == null
      ? ''
      : percentage >= 90
        ? 'text-good'
        : percentage < 70
          ? 'text-bad'
          : '';
  const facts: Array<[string, React.ReactNode]> = [
    [
      isGradescope ? 'Gradescope due date' : 'Canvas due date',
      item.due_at ? formatWhen(item.due_at) : 'No due date',
    ],
    ...(item.personal_due_at
      ? ([['Personal target', formatWhen(item.personal_due_at)]] as Array<
          [string, React.ReactNode]
        >)
      : []),
    ['Points', pointsPossible != null ? String(pointsPossible) : '—'],
    [
      'Submission',
      SUBMISSION_LABEL[String(item.provider_state ?? 'UNSUBMITTED')] ??
        String(item.provider_state),
    ],
  ];

  return (
    <PageFrame
      title={String(item.title)}
      eyebrow={String(item.course_code)}
      actions={
        item.source_url ? (
          <Link
            target="_blank"
            rel="noreferrer"
            href={String(item.source_url)}
            className="pill"
          >
            Open in {isGradescope ? 'Gradescope' : 'Canvas'}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,780px)_minmax(260px,300px)]">
        <article className="min-w-0">
          {lock && (
            <p className="mb-8 flex items-start gap-2.5 border-l-2 border-ink py-0.5 pl-3.5 text-sm text-ink-2">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {lock}
            </p>
          )}
          <section aria-labelledby="instructions-title" data-course-id={courseId}>
            <h2
              id="instructions-title"
              className="section-label mb-4 flex items-center gap-2"
            >
              <CourseColorDot
                courseId={courseId}
                courses={courses}
                className="size-2"
              />
              Instructions
            </h2>
            <div
              className="canvas-html max-w-[68ch]"
              dangerouslySetInnerHTML={{
                __html: String(
                  item.sanitized_html ??
                    '<p>No instructions were provided.</p>',
                ),
              }}
            />
          </section>
          {(comments.length > 0 || rubric.length > 0) && (
            <section aria-labelledby="feedback-title" className="mt-14">
              <h2 id="feedback-title" className="section-label mb-3">
                Feedback and rubric
              </h2>
              <ul className="rule-rows">
                {rubric.map((line, index) => (
                  <li
                    key={`rubric-${index}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 py-3"
                  >
                    <span className="text-[0.9375rem]">{line.label}</span>
                    <span className="numeral text-[1.0625rem]">
                      {line.points ?? '—'}
                      {line.max != null && (
                        <span className="text-ink-3"> / {line.max}</span>
                      )}
                    </span>
                    {line.comment && (
                      <p className="col-span-2 font-serif text-[1rem] leading-relaxed text-ink-2">
                        {line.comment}
                      </p>
                    )}
                  </li>
                ))}
                {comments.map((comment, index) => (
                  <li key={`comment-${index}`} className="py-3">
                    <p className="text-[0.78125rem] text-ink-3">
                      {comment.author}
                      {comment.at && <> · {formatWhen(comment.at)}</>}
                    </p>
                    <p className="mt-1 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line">
                      {comment.text}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
        <aside className="min-w-0 space-y-10 lg:border-l lg:border-rule lg:pl-10">
          {(isGraded || score != null || grade) && (
            <section aria-label="Score">
              <p className="section-label">Score</p>
              <p className={cn('numeral mt-1 text-[2.5rem] leading-none', scoreTone)}>
                {score != null
                  ? `${score}${pointsPossible != null ? ` / ${pointsPossible}` : ''}`
                  : (grade ?? 'Not posted')}
              </p>
              {percentage != null && (
                <p className="mt-2 text-[0.8125rem] text-ink-3">
                  <span className={cn('tabular-nums', scoreTone || 'text-ink-2')}>
                    {percentage.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </span>
                  {grade && grade !== String(score) && <span> · {grade}</span>}
                </p>
              )}
            </section>
          )}
          <dl className="rule-rows text-[0.8125rem]">
            {facts.map(([term, value]) => (
              <div key={term} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-3">{term}</dt>
                <dd className="text-right text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <section aria-labelledby="work-title">
            <h2 id="work-title" className="section-label mb-4">
              Work on it
            </h2>
            <AssignmentActions
              assignmentId={Number(item.id)}
              localTaskId={Number(item.local_task_id)}
              initialStatus={
                String(item.workflow_status ?? 'NOT_STARTED') as
                  | 'NOT_STARTED'
                  | 'IN_PROGRESS'
                  | 'DONE_LOCALLY'
                  | 'SUBMITTED'
                  | 'GRADED'
              }
              initialNotes={String(item.notes ?? '')}
              initialTrackedSeconds={Number(item.tracked_seconds ?? 0)}
              initialTimerStartedAt={
                item.active_timer_started_at
                  ? String(item.active_timer_started_at)
                  : null
              }
              initialPriority={Number(item.priority ?? 0)}
              initialPersonalDueAt={
                item.personal_due_at ? String(item.personal_due_at) : null
              }
              initialEstimatedMinutes={
                item.estimated_minutes == null
                  ? null
                  : Number(item.estimated_minutes)
              }
              initialPinned={Boolean(item.pinned)}
              initialSubtasks={
                item.subtasks as Array<{
                  id: number;
                  local_task_id: number;
                  title: string;
                  completed: boolean;
                  position: number;
                }>
              }
            />
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
