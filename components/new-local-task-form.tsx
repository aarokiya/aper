'use client';

import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const labelClass = 'block text-[0.8125rem] text-ink-2';

export function NewLocalTaskForm({
  courses,
  initialTitle,
  open: controlledOpen,
  onClose,
  onCreated,
}: {
  courses: Array<{ id: number; code: string }>;
  initialTitle?: string;
  /** Supply to drive the form from outside; the trigger button is then hidden. */
  open?: boolean;
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : selfOpen;
  const close = () => (controlled ? onClose?.() : setSelfOpen(false));
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (controlled && controlledOpen)
      titleRef.current?.focus({ preventScroll: true });
  }, [controlled, controlledOpen]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const values = new FormData(event.currentTarget);
      const dueValue = values.get('due');
      const titleValue = values.get('title');
      const notesValue = values.get('notes');
      const due = typeof dueValue === 'string' ? dueValue : '';
      const response = await fetch('/api/local-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: typeof titleValue === 'string' ? titleValue : '',
          courseId: values.get('courseId')
            ? Number(values.get('courseId'))
            : null,
          personalDueAt: due ? new Date(due).toISOString() : null,
          notes: typeof notesValue === 'string' ? notesValue : '',
          priority: Number(values.get('priority') ?? 0),
          estimatedMinutes: values.get('estimate')
            ? Number(values.get('estimate'))
            : null,
          pinned: values.get('pinned') === 'on',
        }),
      });
      if (!response.ok) throw new Error('Unable to create task');
      if (onCreated) onCreated();
      else window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return controlled ? null : (
      <button
        type="button"
        className="pill pill-primary"
        onClick={() => setSelfOpen(true)}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        New local task
      </button>
    );
  return (
    <form
      onSubmit={submit}
      aria-label="New local task"
      className={cn(
        'grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-6',
        !controlled && 'border-y border-rule py-6',
      )}
    >
      <label className={cn(labelClass, 'sm:col-span-2 lg:col-span-6')}>
        Title
        <input
          required
          ref={titleRef}
          defaultValue={initialTitle}
          name="title"
          placeholder="Reading, study block, office hours…"
          className="field mt-1.5 font-serif text-[1.0625rem]"
        />
      </label>
      <label className={cn(labelClass, 'lg:col-span-2')}>
        Course
        <select name="courseId" className="field mt-1.5">
          <option value="">No course</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code}
            </option>
          ))}
        </select>
      </label>
      <label className={cn(labelClass, 'lg:col-span-2')}>
        Personal due date
        <input name="due" type="datetime-local" className="field mt-1.5" />
      </label>
      <label className={labelClass}>
        Priority
        <select name="priority" className="field mt-1.5">
          <option value="0">None</option>
          <option value="1">Low</option>
          <option value="2">Medium</option>
          <option value="3">High</option>
        </select>
      </label>
      <label className={labelClass}>
        Estimate (minutes)
        <input name="estimate" type="number" min="0" className="field mt-1.5" />
      </label>
      <label className={cn(labelClass, 'sm:col-span-2 lg:col-span-6')}>
        Notes
        <textarea name="notes" rows={2} className="field mt-1.5 resize-y" />
      </label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:col-span-2 lg:col-span-6">
        <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-2">
          <input name="pinned" type="checkbox" className="accent-accent-ink" />
          Pin task
        </label>
        <span className="flex-1" />
        <button type="button" className="textlink" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="pill pill-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add task'}
        </button>
      </div>
    </form>
  );
}
