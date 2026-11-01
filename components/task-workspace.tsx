'use client';

import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Pin,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LockMark } from '@/components/lock-mark';
import { CourseColorDot } from '@/components/course-color-dot';
import { notifyWorkChanged } from '@/components/shell/class-zones';

type Status =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE_LOCALLY'
  | 'SUBMITTED'
  | 'GRADED';
type Subtask = {
  id: number;
  localTaskId: number;
  title: string;
  completed: boolean;
  position: number;
};
export type WorkspaceTask = {
  key: string;
  assignmentId: number | null;
  localTaskId: number;
  title: string;
  courseId: number | null;
  course: string | null;
  dueAt: string | null;
  personalDueAt: string | null;
  type: string;
  providerState: string | null;
  workflowStatus: Status;
  priority: number;
  estimatedMinutes: number | null;
  pinned: boolean;
  notes: string;
  pointsPossible: number | null;
  subtasks: Subtask[];
  lockNote: string | null;
};

const statusLabels: Record<Status, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE_LOCALLY: 'Done locally',
  SUBMITTED: 'Submitted',
  GRADED: 'Graded',
};
const priorityLabels = ['None', 'Low', 'Medium', 'High'];
const finished: Status[] = ['SUBMITTED', 'GRADED', 'DONE_LOCALLY'];
const defaultFilters = {
  course: 'all',
  status: 'all',
  type: 'all',
  due: 'all',
  priority: 'all',
  sort: 'due',
};
const labelClass = 'block text-[0.8125rem] text-ink-2';

/** Quiet underlined select used in the filter line (artifact `.bl select`). */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="flex items-baseline gap-2 text-[0.8125rem] text-ink-3">
      {label}
      <span className="relative inline-flex">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'max-w-[11rem] cursor-pointer appearance-none truncate rounded-none border-0 border-b border-rule-2 bg-transparent py-0.5 pr-5 pl-0 text-[0.8125rem] transition-colors outline-none hover:border-ink-4 focus-visible:border-ink',
            value === options[0]?.[0] ? 'text-ink-2' : 'text-ink',
          )}
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-0 size-3 -translate-y-1/2 text-ink-4"
        />
      </span>
    </label>
  );
}

/** Three hairline bars filled to the priority level; silent at zero. */
function PriorityMark({ level }: { level: number }) {
  if (!level) return null;
  return (
    <span
      title={`${priorityLabels[level]} priority`}
      className="inline-flex h-3 items-end gap-[2px]"
    >
      <span className="sr">{priorityLabels[level]} priority</span>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          aria-hidden="true"
          className={cn(
            'w-[3px] rounded-[1px]',
            bar <= level ? 'bg-ink' : 'bg-rule-2',
            level === 3 && bar <= level && 'bg-bad',
          )}
          style={{ height: `${4 + bar * 3}px` }}
        />
      ))}
    </span>
  );
}

const toInputDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function TaskWorkspace({
  initialTasks,
  courses,
  initialSelectedTaskId,
  initialDue = 'all',
}: {
  initialTasks: WorkspaceTask[];
  courses: Array<{ id: number; code: string }>;
  initialSelectedTaskId?: number;
  initialDue?: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [due, setDue] = useState(initialDue);
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('due');
  const [editing, setEditing] = useState<WorkspaceTask | null>(() =>
    initialSelectedTaskId
      ? (initialTasks.find(
          (task) => task.localTaskId === initialSelectedTaskId,
        ) ?? null)
      : null,
  );
  const [deleting, setDeleting] = useState<WorkspaceTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setInteractive(true);
    setNow(Date.now());
  }, []);
  const types = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.type))).sort(),
    [tasks],
  );
  const filtered = useMemo(() => {
    const now = new Date();
    const endWeek = new Date(now.getTime() + 7 * 86_400_000);
    const endFortnight = new Date(now.getTime() + 14 * 86_400_000);
    return tasks
      .filter((task) => {
        const date = task.personalDueAt ?? task.dueAt;
        const time = date ? new Date(date) : null;
        const text = `${task.title} ${task.course ?? ''}`.toLowerCase();
        if (query && !text.includes(query.toLowerCase())) return false;
        if (course !== 'all' && String(task.courseId) !== course) return false;
        if (status !== 'all' && task.workflowStatus !== status) return false;
        if (type !== 'all' && task.type !== type) return false;
        if (priority !== 'all' && String(task.priority) !== priority)
          return false;
        if (
          due === 'overdue' &&
          (!time ||
            time >= now ||
            ['SUBMITTED', 'GRADED', 'DONE_LOCALLY'].includes(
              task.workflowStatus,
            ))
        )
          return false;
        if (
          due === 'today' &&
          (!time || time.toDateString() !== now.toDateString())
        )
          return false;
        if (due === 'week' && (!time || time < now || time > endWeek))
          return false;
        if (due === 'fortnight' && (!time || time < now || time > endFortnight))
          return false;
        if (due === 'none' && time) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
        if (sort === 'priority') return b.priority - a.priority;
        if (sort === 'course')
          return String(a.course).localeCompare(String(b.course));
        if (sort === 'status')
          return a.workflowStatus.localeCompare(b.workflowStatus);
        return String(a.personalDueAt ?? a.dueAt ?? '9999').localeCompare(
          String(b.personalDueAt ?? b.dueAt ?? '9999'),
        );
      });
  }, [course, due, priority, query, sort, status, tasks, type]);
  const patchTask = async (
    task: WorkspaceTask,
    patch: Partial<WorkspaceTask>,
  ) => {
    const previous = tasks;
    setMutationError(null);
    setTasks((items) =>
      items.map((item) =>
        item.key === task.key ? { ...item, ...patch } : item,
      ),
    );
    const payload = {
      ...(task.assignmentId
        ? { assignmentId: task.assignmentId }
        : { localTaskId: task.localTaskId }),
      workflowStatus: patch.workflowStatus,
      priority: patch.priority,
      personalDueAt: patch.personalDueAt,
      estimatedMinutes: patch.estimatedMinutes,
      pinned: patch.pinned,
      notes: patch.notes,
    };
    try {
      const response = await fetch('/api/local-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Unable to save task');
      notifyWorkChanged();
      return true;
    } catch {
      setTasks(previous);
      setMutationError('That change could not be saved. Please try again.');
      return false;
    }
  };
  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const values = new FormData(event.currentTarget);
      const targetValue = values.get('target');
      const statusValue = values.get('status');
      const notesValue = values.get('notes');
      const target = typeof targetValue === 'string' ? targetValue : '';
      const patch = {
        workflowStatus: (typeof statusValue === 'string'
          ? statusValue
          : 'NOT_STARTED') as Status,
        priority: Number(values.get('priority')),
        personalDueAt: target ? new Date(target).toISOString() : null,
        estimatedMinutes: values.get('estimate')
          ? Number(values.get('estimate'))
          : null,
        pinned: values.get('pinned') === 'on',
        notes: typeof notesValue === 'string' ? notesValue : '',
      };
      const saved = await patchTask(editing, patch);
      if (!saved) return;
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };
  const addSubtask = async () => {
    if (!editing || !newSubtask.trim()) return;
    const response = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localTaskId: editing.localTaskId,
        title: newSubtask,
      }),
    });
    if (!response.ok) return;
    const subtask = (await response.json()) as Subtask;
    const updated = { ...editing, subtasks: [...editing.subtasks, subtask] };
    setEditing(updated);
    setTasks((items) =>
      items.map((item) => (item.key === updated.key ? updated : item)),
    );
    setNewSubtask('');
  };
  const toggleSubtask = async (subtask: Subtask) => {
    await fetch('/api/subtasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: subtask.id, completed: !subtask.completed }),
    });
    if (!editing) return;
    const updated = {
      ...editing,
      subtasks: editing.subtasks.map((item) =>
        item.id === subtask.id ? { ...item, completed: !item.completed } : item,
      ),
    };
    setEditing(updated);
    setTasks((items) =>
      items.map((item) => (item.key === updated.key ? updated : item)),
    );
  };
  const deleteTask = async (task: WorkspaceTask) => {
    const previous = tasks;
    setMutationError(null);
    setTasks((items) => items.filter((item) => item.key !== task.key));
    setDeleting(null);
    try {
      const response = await fetch(
        `/api/local-tasks?id=${task.localTaskId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Unable to delete task');
      router.refresh();
    } catch {
      setTasks(previous);
      setMutationError('That task could not be deleted. Please try again.');
    }
  };
  const removeSubtask = async (subtask: Subtask) => {
    await fetch(`/api/subtasks?id=${subtask.id}`, { method: 'DELETE' });
    if (!editing) return;
    const updated = {
      ...editing,
      subtasks: editing.subtasks.filter((item) => item.id !== subtask.id),
    };
    setEditing(updated);
    setTasks((items) =>
      items.map((item) => (item.key === updated.key ? updated : item)),
    );
  };
  const filters = { course, status, type, due, priority, sort };
  const filtersChanged = (
    Object.keys(defaultFilters) as Array<keyof typeof defaultFilters>
  ).some((key) => filters[key] !== defaultFilters[key]);
  const clearFilters = () => {
    setQuery('');
    setCourse(defaultFilters.course);
    setStatus(defaultFilters.status);
    setType(defaultFilters.type);
    setDue(defaultFilters.due);
    setPriority(defaultFilters.priority);
    setSort(defaultFilters.sort);
  };
  return (
    <div>
      <div className="space-y-4">
        <label className="flex max-w-xl items-center gap-2.5 border-b border-rule transition-colors focus-within:border-ink">
          <Search className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
          <span className="sr">Search tasks</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:appearance-none"
          />
        </label>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <FilterSelect
            label="Course"
            value={course}
            onChange={setCourse}
            options={[
              ['all', 'All courses'],
              ...courses.map((item) => [String(item.id), item.code]),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[['all', 'All statuses'], ...Object.entries(statusLabels)]}
          />
          <FilterSelect
            label="Type"
            value={type}
            onChange={setType}
            options={[
              ['all', 'All types'],
              ...types.map((item) => [
                item,
                item.charAt(0) + item.slice(1).toLowerCase().replaceAll('_', ' '),
              ]),
            ]}
          />
          <FilterSelect
            label="Due"
            value={due}
            onChange={setDue}
            options={[
              ['all', 'Any date'],
              ['overdue', 'Overdue'],
              ['today', 'Due today'],
              ['week', 'Next 7 days'],
              ['fortnight', 'Next 2 weeks'],
              ['none', 'No date'],
            ]}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              ['all', 'Any priority'],
              ['3', 'High'],
              ['2', 'Medium'],
              ['1', 'Low'],
              ['0', 'None'],
            ]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              ['due', 'Due date'],
              ['priority', 'Priority'],
              ['course', 'Course'],
              ['status', 'Status'],
            ]}
          />
        </div>
      </div>
      <div className="mt-8 mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-3" aria-live="polite">
          Showing {filtered.length} of {tasks.length} tasks
        </p>
        {(filtersChanged || query) && (
          <button type="button" className="textlink" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
      {mutationError && (
        <p
          role="alert"
          className="mb-4 border-l-2 border-bad py-0.5 pl-3.5 text-sm text-ink-2"
        >
          {mutationError}
        </p>
      )}
      <div className="rule-rows">
        {filtered.map((task) => {
          const displayDate = task.personalDueAt ?? task.dueAt;
          const done = finished.includes(task.workflowStatus);
          const overdue =
            !done &&
            now !== null &&
            displayDate !== null &&
            new Date(displayDate).getTime() < now;
          const subtasksDone = task.subtasks.filter(
            (item) => item.completed,
          ).length;
          return (
            <article
              key={task.key}
              className="group/task grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3 md:grid-cols-[5rem_6.5rem_minmax(0,1fr)_auto_auto] md:gap-x-4"
            >
              <span
                className={cn(
                  'row-span-2 numeral text-[1.125rem] leading-snug md:row-span-1',
                  !displayDate && 'text-ink-4',
                  overdue && 'text-bad',
                  done && 'text-ink-4',
                )}
              >
                {displayDate
                  ? new Date(displayDate).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </span>
              <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-1.5 text-[0.78125rem] text-ink-3 md:col-start-auto md:row-start-auto">
                <CourseColorDot
                  courseId={task.courseId}
                  courses={courses}
                  className="size-1.5"
                />
                <span className="truncate">{task.course ?? 'Personal'}</span>
              </span>
              <div className="col-start-2 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                <button
                  type="button"
                  onClick={() =>
                    task.assignmentId
                      ? router.push(`/assignments/${task.assignmentId}`)
                      : setEditing(task)
                  }
                  className={cn(
                    'flex max-w-full items-center gap-1.5 text-left text-[0.9375rem] leading-snug underline-offset-[3px] hover:underline',
                    done && 'text-ink-3',
                  )}
                >
                  {task.pinned && (
                    <Pin
                      aria-hidden="true"
                      className="size-3 shrink-0 fill-current text-ink-3"
                    />
                  )}
                  <span className="truncate">{task.title}</span>
                  <LockMark note={task.lockNote} />
                </button>
                <p className="mt-0.5 hidden flex-wrap gap-x-3 text-[0.78125rem] text-ink-3 md:flex">
                  {displayDate && (
                    <span>
                      {new Date(displayDate).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {task.personalDueAt && (
                    <span className="text-ink-2">Personal target</span>
                  )}
                  {task.estimatedMinutes ? (
                    <span>{task.estimatedMinutes} min</span>
                  ) : null}
                  {task.subtasks.length > 0 && (
                    <span>
                      {subtasksDone}/{task.subtasks.length} subtasks
                    </span>
                  )}
                </p>
              </div>
              <span className="col-start-2 row-start-3 flex items-center gap-2.5 text-[0.78125rem] md:col-start-auto md:row-start-auto md:justify-end">
                <PriorityMark level={task.priority} />
                <span
                  className={cn(
                    done ? 'text-good' : 'text-ink-3',
                    task.workflowStatus === 'IN_PROGRESS' && 'text-ink',
                  )}
                >
                  {statusLabels[task.workflowStatus]}
                </span>
              </span>
              <div className="col-start-3 row-span-3 row-start-1 self-start md:col-start-auto md:row-span-1 md:row-start-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label={`Actions for ${task.title}`}
                        disabled={!interactive}
                        size="icon-sm"
                        variant="ghost"
                        className="text-ink-3 hover:text-ink"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {task.assignmentId && (
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/assignments/${task.assignmentId}`)
                        }
                      >
                        Open assignment
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setEditing(task)}>
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        void patchTask(task, { workflowStatus: 'NOT_STARTED' })
                      }
                    >
                      Mark not started
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void patchTask(task, { workflowStatus: 'IN_PROGRESS' })
                      }
                    >
                      Mark in progress
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void patchTask(task, { workflowStatus: 'DONE_LOCALLY' })
                      }
                    >
                      Mark done locally
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void patchTask(task, { priority: 3 })}
                    >
                      High priority
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void patchTask(task, { priority: 2 })}
                    >
                      Medium priority
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void patchTask(task, { priority: 0 })}
                    >
                      Clear priority
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void patchTask(task, { pinned: !task.pinned })
                      }
                    >
                      {task.pinned ? 'Unpin task' : 'Pin task'}
                    </DropdownMenuItem>
                    {!task.assignmentId && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(task)}
                        >
                          Delete task
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <p className="py-10 text-[0.9375rem] text-ink-3">
            No tasks match these filters.{' '}
            {(filtersChanged || query) && (
              <button type="button" className="textlink" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </p>
        )}
      </div>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing.title}</DialogTitle>
              <DialogDescription>
                {editing.course ?? 'Personal task'} · your local workflow is
                kept separate from Canvas and Gradescope
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="space-y-5">
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Workflow
                  <select
                    name="status"
                    defaultValue={editing.workflowStatus}
                    className="field mt-1.5"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Priority
                  <select
                    name="priority"
                    defaultValue={editing.priority}
                    className="field mt-1.5"
                  >
                    {priorityLabels.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Personal target
                  <input
                    name="target"
                    type="datetime-local"
                    defaultValue={toInputDate(editing.personalDueAt)}
                    className="field mt-1.5"
                  />
                </label>
                <label className={labelClass}>
                  Estimated minutes
                  <input
                    name="estimate"
                    type="number"
                    min="0"
                    defaultValue={editing.estimatedMinutes ?? ''}
                    className="field mt-1.5"
                  />
                </label>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-2">
                <input
                  name="pinned"
                  type="checkbox"
                  defaultChecked={editing.pinned}
                  className="accent-accent-ink"
                />
                Pin this task
              </label>
              <label className={labelClass}>
                Local notes
                <textarea
                  name="notes"
                  defaultValue={editing.notes}
                  rows={3}
                  className="field mt-1.5 resize-y"
                />
              </label>
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="section-label">Subtasks</h3>
                  <span className="text-xs text-ink-3 tabular-nums">
                    {editing.subtasks.filter((item) => item.completed).length}/
                    {editing.subtasks.length}
                  </span>
                </div>
                <div className={cn(editing.subtasks.length > 0 && 'rule-rows')}>
                  {editing.subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-3 py-2"
                    >
                      <button
                        type="button"
                        aria-label={`${subtask.completed ? 'Reopen' : 'Complete'} ${subtask.title}`}
                        aria-pressed={subtask.completed}
                        onClick={() => toggleSubtask(subtask)}
                        className={cn(
                          'grid size-[1.125rem] shrink-0 place-items-center rounded-full border border-rule-2 transition-colors hover:border-ink',
                          subtask.completed &&
                            'border-good bg-good text-paper hover:border-good',
                        )}
                      >
                        {subtask.completed && <Check className="size-3" />}
                      </button>
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-sm',
                          subtask.completed &&
                            'text-ink-3 line-through decoration-ink-4',
                        )}
                      >
                        {subtask.title}
                      </span>
                      <Button
                        type="button"
                        aria-label={`Delete ${subtask.title}`}
                        onClick={() => removeSubtask(subtask)}
                        size="icon-xs"
                        variant="ghost"
                        className="text-ink-4 hover:text-ink"
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newSubtask}
                    onChange={(event) => setNewSubtask(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void addSubtask();
                      }
                    }}
                    placeholder="Add a subtask…"
                    aria-label="Add a subtask"
                    className="field min-w-0 flex-1"
                  />
                  <button type="button" onClick={addSubtask} className="pill">
                    Add
                  </button>
                </div>
              </section>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => setEditing(null)}
                  variant="link"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save task'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” and its subtasks and timer sessions are
              removed from this device. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep task</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && void deleteTask(deleting)}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
