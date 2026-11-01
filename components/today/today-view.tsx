'use client';

import './today.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppearance } from '@/components/appearance/appearance-provider';
import {
  SCREENSAVER_SHORTCUT,
  startScreensaver,
} from '@/components/ambient/screensaver';
import { useReducedMotion } from '@/components/ambient/use-reduced-motion';
import { CourseColorDot } from '@/components/course-color-dot';
import { openCommandPalette } from '@/components/command-palette';
import { notifyWorkChanged } from '@/components/shell/class-zones';
import { TODAY_SECTIONS, type TodaySectionId } from '@/lib/appearance/schema';
import { getCourseColor } from '@/lib/course-colors';
import type { DashboardData } from '@/lib/db/queries';
import { lockNote } from '@/lib/tasks/lock';
import { selectAttention } from '@/lib/tasks/priority';
import { isTaskComplete } from '@/lib/tasks/status';
import { composeSummary } from '@/lib/today/summary';
import type { TodayStudy } from '@/lib/today/study';
import { TodayHero } from './hero';
import {
  ChangesList,
  ExamList,
  GradedList,
  Section,
  StudyWeekList,
} from './sections';
import {
  TaskRow,
  type TaskActions,
  type TaskStatus,
  type TaskTone,
  type UiTask,
} from './task-row';

export type TodayCareers = {
  events: React.ReactNode;
};

const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
const DAY_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const WEEKDAY_TIME = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const SHORT_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function dueLine(
  task: DashboardData['tasks'][number],
  now: Date,
): { meta: string; tone: TaskTone } {
  const effective = task.personalDueAt ?? task.dueAt;
  if (!effective) return { meta: 'No due date', tone: 'none' };
  const due = new Date(effective);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 864e5);
  const tone: TaskTone =
    task.providerState === 'UNSUBMITTED' && due < now
      ? 'overdue'
      : days === 0
        ? 'today'
        : days === 1
          ? 'tomorrow'
          : 'later';
  if (task.personalDueAt)
    return { meta: `Your target, ${DAY_TIME.format(due)}`, tone };
  if (tone === 'overdue')
    return { meta: `Overdue since ${DAY_TIME.format(due)}`, tone };
  if (tone === 'today') return { meta: `Today, ${TIME.format(due)}`, tone };
  if (tone === 'tomorrow')
    return { meta: `Tomorrow, ${TIME.format(due)}`, tone };
  return { meta: WEEKDAY_TIME.format(due), tone };
}

const sectionOrder = (order: TodaySectionId[], hidden: TodaySectionId[]) =>
  [
    ...order,
    ...TODAY_SECTIONS.map((section) => section.id).filter(
      (id) => !order.includes(id),
    ),
  ].filter(
    (id, index, list) => !hidden.includes(id) && list.indexOf(id) === index,
  );

/** Today: hero, then the day's work and study in the user's section order. */
export function TodayView({
  data,
  today,
  hour,
  study,
  careers,
  classIds,
}: {
  data: DashboardData;
  today: string;
  hour: number;
  study: TodayStudy;
  careers: TodayCareers;
  /** current-term academic classes (no clubs or orientation sites), for "Your courses" */
  classIds: number[];
}) {
  const router = useRouter();
  const { appearance, openCustomizer } = useAppearance();
  const reducedMotion = useReducedMotion();
  const [now] = useState(() => new Date(data.now));
  const [tasks, setTasks] = useState<UiTask[]>(() =>
    data.tasks.map((task) => {
      const { meta, tone } = dueLine(task, now);
      return {
        id: task.id,
        courseId: task.courseId,
        course: task.course,
        color: getCourseColor(task.courseId, data.courses),
        title: task.title,
        meta,
        points:
          task.pointsPossible == null ? null : `${task.pointsPossible} pts`,
        status: task.workflowStatus as TaskStatus,
        tone,
        dueAt: task.dueAt,
        personalDueAt: task.personalDueAt,
        providerState: task.providerState,
        priority: task.priority,
        pinned: Boolean(task.pinned),
        sourceProvider: task.sourceProvider,
        sourceUrl: task.sourceUrl,
        lockNote: lockNote(task.locked, task.lockExplanation, task.unlockAt),
      };
    }),
  );
  const [interactive, setInteractive] = useState(false);
  const [leaving, setLeaving] = useState<number[]>([]);
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => setInteractive(true), []);

  const open = tasks.filter(
    (task) => !isTaskComplete(task.providerState, task.status),
  );
  const attention = selectAttention(
    open.map((task) => ({
      ...task,
      urgent: task.tone === 'overdue' || task.tone === 'today',
    })),
    now,
  );
  const tomorrow = open.filter((task) => task.tone === 'tomorrow');
  const fortnightStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 2,
  );
  const fortnightEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 14,
    23,
    59,
    59,
    999,
  );
  const fortnight = open
    .filter((task) => {
      const value = task.personalDueAt ?? task.dueAt;
      if (!value) return false;
      const due = new Date(value);
      return due >= fortnightStart && due <= fortnightEnd;
    })
    .sort((a, b) =>
      String(a.personalDueAt ?? a.dueAt).localeCompare(
        String(b.personalDueAt ?? b.dueAt),
      ),
    );

  const summary = composeSummary({
    overdue: open.filter((task) => task.tone === 'overdue').length,
    dueToday: open.filter((task) => task.tone === 'today').length,
    dueTomorrow: tomorrow.length,
    exam: study.exams[0] ?? null,
  });

  const patchTask = async (
    id: number,
    patch: { status?: TaskStatus; priority?: number; pinned?: boolean },
  ) => {
    let previous: UiTask[] = [];
    setTasks((items) => {
      previous = items;
      return items.map((task) =>
        task.id === id ? { ...task, ...patch } : task,
      );
    });
    try {
      const response = await fetch('/api/local-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: id,
          workflowStatus: patch.status,
          priority: patch.priority,
          pinned: patch.pinned,
        }),
      });
      if (!response.ok) throw new Error('Unable to update task');
      notifyWorkChanged();
    } catch {
      setTasks(previous);
    }
  };

  const actions: TaskActions = {
    onComplete: (id) => {
      if (reducedMotion) {
        void patchTask(id, { status: 'DONE_LOCALLY' });
        return;
      }
      setLeaving((ids) => [...ids, id]);
      window.setTimeout(() => {
        setLeaving((ids) => ids.filter((value) => value !== id));
        void patchTask(id, { status: 'DONE_LOCALLY' });
      }, 260);
    },
    onStatus: (id, status) => void patchTask(id, { status }),
    onPriority: (id, priority) => void patchTask(id, { priority }),
    onPin: (id, pinned) => void patchTask(id, { pinned }),
    onOpen: (id) => router.push(`/assignments/${id}`),
  };

  const rows = (list: UiTask[], empty: string) =>
    list.length ? (
      <div className="rule-rows">
        {list.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            actions={actions}
            interactive={interactive}
            leaving={leaving.includes(task.id)}
          />
        ))}
      </div>
    ) : (
      <p className="border-y border-rule py-4 text-[13px] text-ink-3">
        {empty}
      </p>
    );

  const connectCanvas = async () => {
    setAuthenticating(true);
    try {
      await fetch('/api/canvas/auth', { method: 'POST' });
      router.refresh();
    } finally {
      setAuthenticating(false);
    }
  };

  const viewAll = (href: string, label = 'View all') => (
    <Link href={href} className="textlink">
      {label}
    </Link>
  );

  const sections: Record<TodaySectionId, React.ReactNode> = {
    attention: data.hasData && (
      <Section
        key="attention"
        id="attention"
        title="Needs attention"
        action={viewAll('/tasks')}
      >
        {rows(attention, 'Nothing urgent right now.')}
      </Section>
    ),
    tomorrow: data.hasData && (
      <Section
        key="tomorrow"
        id="tomorrow"
        title="Tomorrow"
        action={
          <span className="text-[12.5px] text-ink-4 tabular-nums">
            {tomorrow.length} {tomorrow.length === 1 ? 'item' : 'items'}
          </span>
        }
      >
        {rows(tomorrow, 'No work due tomorrow.')}
      </Section>
    ),
    exams: study.exams.length > 0 && (
      <Section
        key="exams"
        id="exams"
        title="Coming up"
        action={viewAll('/study', 'Study Hub')}
      >
        <ExamList exams={study.exams} />
      </Section>
    ),
    study: (study.courses.length > 0 || study.dailyDue > 0) && (
      <Section key="study" id="study" title="This week in study">
        {study.dailyDue > 0 && (
          <p className="mb-3 text-[13.5px]">
            <Link
              href="/study/daily"
              className="text-ink underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
            >
              Daily review: {study.dailyDue} due
            </Link>
          </p>
        )}
        {study.courses.length > 0 && <StudyWeekList courses={study.courses} />}
      </Section>
    ),
    fortnight: data.hasData && (
      <Section
        key="fortnight"
        id="fortnight"
        title="Next 2 weeks"
        note={`After tomorrow, through ${SHORT_DAY.format(fortnightEnd)}`}
        action={
          <button
            type="button"
            className="textlink"
            onClick={() => router.push('/tasks?due=fortnight')}
          >
            {fortnight.length} items · View all
          </button>
        }
      >
        {rows(
          fortnight.slice(0, 12),
          'Nothing else is due in the next two weeks.',
        )}
        {fortnight.length > 12 && (
          <button
            type="button"
            className="textlink mt-3"
            onClick={() => router.push('/tasks?due=fortnight')}
          >
            {fortnight.length - 12} more in Tasks
          </button>
        )}
      </Section>
    ),
    events: (
      <Section
        key="events"
        id="events"
        title="Campus events"
        action={viewAll('/careers')}
      >
        {careers.events}
      </Section>
    ),
    graded: data.hasData && (
      <Section
        key="graded"
        id="graded"
        title="Recently graded"
        action={viewAll('/grades', 'Grades')}
      >
        <GradedList
          items={data.recentlyGraded.slice(0, 5)}
          courses={data.courses}
        />
      </Section>
    ),
    changes: data.hasData && (
      <Section key="changes" id="changes" title="Recent changes">
        <ChangesList items={data.changes.slice(0, 5)} courses={data.courses} />
      </Section>
    ),
  };

  const classes = data.courses.filter((course) => classIds.includes(course.id));
  const lastSynced = data.provider.lastSuccessAt
    ? `Last synced ${DAY_TIME.format(new Date(data.provider.lastSuccessAt))}`
    : 'Not synced yet';

  return (
    <div>
      <TodayHero today={today} hour={hour} summary={summary} />
      <div className="today-body">
        <div className="grid gap-x-14 gap-y-14 xl:grid-cols-[minmax(0,780px)_minmax(13rem,17rem)]">
          <div className="flex min-w-0 flex-col gap-11">
            {!data.hasData && (
              <section aria-labelledby="today-connect" className="max-w-[60ch]">
                <h2 id="today-connect" className="display text-[1.75rem]">
                  Connect Georgia Tech Canvas
                </h2>
                <p className="mt-3 text-[15px] text-ink-2">
                  A dedicated browser window will open. Sign in through Georgia
                  Tech SSO and complete Duo yourself; the app stores only the
                  resulting browser session in its private local profile.
                </p>
                <button
                  type="button"
                  className="pill pill-primary mt-5"
                  onClick={connectCanvas}
                  disabled={authenticating}
                >
                  {authenticating ? 'Waiting for sign-in…' : 'Connect Canvas'}
                </button>
                <p className="mt-4 text-[13px] text-ink-3">
                  Your password and Duo response are never read or stored by
                  this app.
                </p>
              </section>
            )}
            {sectionOrder(appearance.today.order, appearance.today.hidden).map(
              (id) => sections[id],
            )}
          </div>

          <aside
            aria-label="At a glance"
            className="flex min-w-0 flex-col gap-10 xl:sticky xl:top-8 xl:self-start"
          >
            <div>
              <h2 className="section-label mb-2">Sync</h2>
              <p className="flex items-center gap-2 text-[13px] text-ink-2">
                <span
                  aria-hidden="true"
                  className={
                    data.provider.authStatus === 'CONNECTED'
                      ? 'size-1.5 rounded-full bg-good'
                      : 'size-1.5 rounded-full bg-[var(--course-gold)]'
                  }
                />
                {lastSynced}
              </p>
              {data.provider.lastError &&
                data.provider.authStatus !== 'CONNECTED' && (
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    Canvas needs you to sign in again from Settings.
                  </p>
                )}
            </div>

            {classes.length > 0 && (
              <div>
                <h2 className="section-label mb-2">Your courses</h2>
                <ul className="rule-rows">
                  {classes.map((course) => (
                    <li key={course.id}>
                      <Link
                        href={`/courses/${course.id}`}
                        title={course.name}
                        className="group flex items-baseline gap-2 py-2"
                      >
                        <CourseColorDot
                          courseId={course.id}
                          courses={data.courses}
                          className="size-1.5 self-center"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">
                          {course.code}
                        </span>
                        <span className="numeral text-[15px] text-ink">
                          {course.grade ??
                            (course.score == null
                              ? '—'
                              : `${course.score.toFixed(1)}%`)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2 className="section-label mb-2">Shortcuts</h2>
              <ul className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                <li>
                  <button
                    type="button"
                    className="textlink flex w-full items-center justify-between gap-3"
                    onClick={openCommandPalette}
                  >
                    Search and commands <span className="kbd">⌘K</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="textlink flex w-full items-center justify-between gap-3"
                    onClick={startScreensaver}
                  >
                    Screensaver{' '}
                    <span className="kbd">{SCREENSAVER_SHORTCUT.keys}</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="textlink"
                    onClick={() => openCustomizer()}
                  >
                    Customize Today
                  </button>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
