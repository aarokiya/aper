'use client';

import { Check, MoreHorizontal } from 'lucide-react';
import { CourseColorDot } from '@/components/course-color-dot';
import { LockMark } from '@/components/lock-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE_LOCALLY'
  | 'SUBMITTED'
  | 'GRADED';

export type TaskTone = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';

export type UiTask = {
  id: number;
  courseId: number;
  course: string;
  color: string;
  title: string;
  /** "Today, 11:59 PM" */
  meta: string;
  points: string | null;
  status: TaskStatus;
  tone: TaskTone;
  dueAt: string | null;
  personalDueAt: string | null;
  providerState: string;
  priority: number;
  pinned: boolean;
  sourceProvider: string;
  sourceUrl: string | null;
  lockNote: string | null;
};

export type TaskActions = {
  onComplete: (id: number) => void;
  onStatus: (id: number, status: TaskStatus) => void;
  onPriority: (id: number, priority: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onOpen: (id: number) => void;
};

/**
 * One piece of work in the artifact's row idiom: a hairline row with the
 * course in a muted column, the title in ink, and its due line below.
 */
export function TaskRow({
  task,
  actions,
  interactive,
  leaving,
}: {
  task: UiTask;
  actions: TaskActions;
  interactive: boolean;
  leaving: boolean;
}) {
  return (
    <article
      className="today-task group grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-start gap-x-3 py-3 sm:grid-cols-[1.125rem_5.5rem_minmax(0,1fr)_auto_auto] sm:gap-x-4"
      data-leaving={leaving}
    >
      <button
        type="button"
        className="today-check mt-[3px]"
        aria-label={`Mark ${task.title} complete`}
        disabled={!interactive || leaving}
        onClick={() => actions.onComplete(task.id)}
      >
        <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
      </button>
      <span
        className="hidden min-w-0 items-center gap-1.5 pt-[3px] text-[12.5px] text-ink-3 sm:flex"
        title={task.course}
      >
        <CourseColorDot
          courseId={task.courseId}
          color={task.color}
          className="size-1.5"
        />
        <span className="truncate">{task.course}</span>
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            onClick={() => actions.onOpen(task.id)}
            className="min-w-0 cursor-pointer truncate text-left text-[15px] leading-snug text-ink decoration-rule-2 underline-offset-[3px] hover:underline"
          >
            {task.title}
          </button>
          <LockMark note={task.lockNote} />
        </div>
        <p
          className={cn(
            'mt-0.5 flex flex-wrap gap-x-2 text-[12.5px]',
            task.tone === 'overdue'
              ? 'text-bad'
              : task.tone === 'today'
                ? 'text-ink-2'
                : 'text-ink-3',
          )}
        >
          <span className="text-ink-3 sm:hidden">{task.course}</span>
          <span>{task.meta}</span>
          {task.status === 'IN_PROGRESS' && (
            <span className="text-ink-3">In progress</span>
          )}
          {task.pinned && <span className="text-ink-3">Pinned</span>}
          {task.priority >= 3 && (
            <span className="text-ink-3">High priority</span>
          )}
        </p>
      </div>
      <span className="hidden pt-[3px] text-[12.5px] whitespace-nowrap text-ink-4 tabular-nums sm:block">
        {task.points}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${task.title}`}
          disabled={!interactive}
          className="-mt-0.5 grid size-7 cursor-pointer place-items-center rounded-full text-ink-3 opacity-70 transition hover:bg-wash hover:text-ink hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default group-hover:opacity-100 data-[popup-open]:bg-wash data-[popup-open]:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => actions.onOpen(task.id)}>
            Open details
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => actions.onStatus(task.id, 'IN_PROGRESS')}
          >
            Mark in progress
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => actions.onStatus(task.id, 'DONE_LOCALLY')}
          >
            Mark done locally
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.onPriority(task.id, 3)}>
            High priority
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onPriority(task.id, 2)}>
            Medium priority
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onPriority(task.id, 0)}>
            Clear priority
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => actions.onPin(task.id, !task.pinned)}
          >
            {task.pinned ? 'Unpin task' : 'Pin task'}
          </DropdownMenuItem>
          {task.sourceUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  window.open(task.sourceUrl!, '_blank', 'noopener,noreferrer')
                }
              >
                Open in{' '}
                {task.sourceProvider === 'gradescope' ? 'Gradescope' : 'Canvas'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}
