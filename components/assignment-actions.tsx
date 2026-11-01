'use client';

import { useEffect, useState } from 'react';
import { Check, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifyWorkChanged } from '@/components/shell/class-zones';
import { cn } from '@/lib/utils';

const labelClass = 'block text-[0.8125rem] text-ink-2';
const formatTracked = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
};

type WorkflowStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE_LOCALLY'
  | 'SUBMITTED'
  | 'GRADED';

const workflowOptions: Array<{ value: WorkflowStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DONE_LOCALLY', label: 'Done locally' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'GRADED', label: 'Graded' },
];

export function AssignmentActions({
  assignmentId,
  localTaskId,
  initialStatus,
  initialNotes,
  initialTrackedSeconds,
  initialTimerStartedAt,
  initialPriority = 0,
  initialPersonalDueAt = null,
  initialEstimatedMinutes = null,
  initialPinned = false,
  initialSubtasks = [],
}: {
  assignmentId: number;
  localTaskId: number;
  initialStatus: WorkflowStatus;
  initialNotes: string;
  initialTrackedSeconds: number;
  initialTimerStartedAt: string | null;
  initialPriority?: number;
  initialPersonalDueAt?: string | null;
  initialEstimatedMinutes?: number | null;
  initialPinned?: boolean;
  initialSubtasks?: Array<{
    id: number;
    local_task_id: number;
    title: string;
    completed: boolean;
    position: number;
  }>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [timerStartedAt, setTimerStartedAt] = useState(initialTimerStartedAt);
  const [now, setNow] = useState(() =>
    initialTimerStartedAt ? new Date(initialTimerStartedAt).getTime() : 0,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [priority, setPriority] = useState(initialPriority);
  const [personalDueAt, setPersonalDueAt] = useState(() => {
    if (!initialPersonalDueAt) return '';
    const date = new Date(initialPersonalDueAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initialEstimatedMinutes?.toString() ?? '',
  );
  const [pinned, setPinned] = useState(initialPinned);
  const [subtasks, setSubtasks] = useState(initialSubtasks);
  const [newSubtask, setNewSubtask] = useState('');
  const elapsed =
    initialTrackedSeconds +
    (timerStartedAt
      ? Math.max(
          0,
          Math.floor((now - new Date(timerStartedAt).getTime()) / 1000),
        )
      : 0);

  useEffect(() => {
    if (!timerStartedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [timerStartedAt]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch('/api/local-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          workflowStatus: status,
          notes,
          priority,
          personalDueAt: personalDueAt
            ? new Date(personalDueAt).toISOString()
            : null,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          pinned,
        }),
      });
      if (!response.ok) throw new Error('Unable to save local task state');
      setSaved(true);
      notifyWorkChanged();
    } finally {
      setSaving(false);
    }
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const response = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localTaskId, title: newSubtask }),
    });
    if (response.ok) {
      const item = await response.json();
      setSubtasks((items) => [...items, item]);
      setNewSubtask('');
    }
  };
  const toggleSubtask = async (id: number, completed: boolean) => {
    const response = await fetch('/api/subtasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completed: !completed }),
    });
    if (response.ok)
      setSubtasks((items) =>
        items.map((item) =>
          item.id === id ? { ...item, completed: !completed } : item,
        ),
      );
  };
  const deleteSubtask = async (id: number) => {
    const response = await fetch(`/api/subtasks?id=${id}`, {
      method: 'DELETE',
    });
    if (response.ok)
      setSubtasks((items) => items.filter((item) => item.id !== id));
  };

  const toggleTimer = async () => {
    setTimerBusy(true);
    try {
      const action = timerStartedAt ? 'stop' : 'start';
      const response = await fetch('/api/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localTaskId, action }),
      });
      if (!response.ok) throw new Error('Unable to update timer');
      const value = (await response.json()) as { startedAt?: string };
      if (action === 'start') {
        setTimerStartedAt(value.startedAt ?? new Date().toISOString());
        if (status === 'NOT_STARTED') setStatus('IN_PROGRESS');
      } else {
        window.location.reload();
      }
    } finally {
      setTimerBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 border-y border-rule py-3">
        <div>
          <p className="text-xs text-ink-3">Tracked</p>
          <p
            className={cn(
              'numeral text-[1.625rem] leading-tight',
              timerStartedAt ? 'text-ink' : 'text-ink-2',
            )}
            aria-live="off"
          >
            {formatTracked(elapsed)}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTimer}
          disabled={timerBusy}
          className={cn('pill', timerStartedAt && 'pill-primary')}
        >
          {timerStartedAt ? (
            <Pause className="size-3.5" aria-hidden="true" />
          ) : (
            <Play className="size-3.5" aria-hidden="true" />
          )}
          {timerStartedAt ? 'Stop timer' : 'Start timer'}
        </button>
      </div>
      <label className={labelClass}>
        Local workflow
        <select
          id="workflow"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as WorkflowStatus);
            setSaved(false);
          }}
          className="field mt-1.5"
        >
          {workflowOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Priority
          <select
            value={priority}
            onChange={(event) => {
              setPriority(Number(event.target.value));
              setSaved(false);
            }}
            className="field mt-1.5"
          >
            <option value="0">None</option>
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High</option>
          </select>
        </label>
        <label className={labelClass}>
          Estimated minutes
          <input
            value={estimatedMinutes}
            onChange={(event) => {
              setEstimatedMinutes(event.target.value);
              setSaved(false);
            }}
            type="number"
            min="0"
            className="field mt-1.5"
          />
        </label>
      </div>
      <label className={labelClass}>
        Personal target date
        <input
          value={personalDueAt}
          onChange={(event) => {
            setPersonalDueAt(event.target.value);
            setSaved(false);
          }}
          type="datetime-local"
          className="field mt-1.5"
        />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-2">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(event) => {
            setPinned(event.target.checked);
            setSaved(false);
          }}
          className="accent-accent-ink"
        />
        Pin to the top of task views
      </label>
      <label className={labelClass}>
        Private local notes
        <textarea
          id="local-notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setSaved(false);
          }}
          rows={6}
          placeholder="Study notes, a plan, or reminders…"
          className="field mt-1.5 resize-y font-serif text-[0.9375rem] leading-relaxed"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="pill pill-primary"
        >
          {saving ? 'Saving…' : 'Save locally'}
        </button>
        {saved && (
          <span aria-live="polite" className="flex items-center gap-1 text-[0.8125rem] text-good">
            <Check className="size-3.5" aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
      <section aria-labelledby="subtasks-title" className="pt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id="subtasks-title" className="section-label">
            Subtasks
          </h3>
          <span className="text-xs text-ink-3 tabular-nums">
            {subtasks.filter((item) => item.completed).length}/{subtasks.length}
          </span>
        </div>
        {subtasks.length > 0 && (
          <ul className="rule-rows">
            {subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  aria-label={`${subtask.completed ? 'Reopen' : 'Complete'} ${subtask.title}`}
                  aria-pressed={subtask.completed}
                  onClick={() => toggleSubtask(subtask.id, subtask.completed)}
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
                    subtask.completed && 'text-ink-3 line-through decoration-ink-4',
                  )}
                >
                  {subtask.title}
                </span>
                <Button
                  type="button"
                  aria-label={`Delete ${subtask.title}`}
                  onClick={() => deleteSubtask(subtask.id)}
                  size="icon-xs"
                  variant="ghost"
                  className="text-ink-4 hover:text-ink"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
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
            aria-label="New subtask"
            className="field min-w-0 flex-1"
          />
          <button type="button" onClick={addSubtask} className="pill">
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
