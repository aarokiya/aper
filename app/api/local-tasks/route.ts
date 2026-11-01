import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';
import { createLocalTask } from '@/lib/db/queries';

const patchSchema = z
  .object({
    assignmentId: z.number().int().positive().optional(),
    localTaskId: z.number().int().positive().optional(),
    workflowStatus: z
      .enum([
        'NOT_STARTED',
        'IN_PROGRESS',
        'DONE_LOCALLY',
        'SUBMITTED',
        'GRADED',
      ])
      .optional(),
    notes: z.string().max(100_000).optional(),
    priority: z.number().int().min(0).max(3).optional(),
    personalDueAt: z.iso.datetime().nullable().optional(),
    estimatedMinutes: z
      .number()
      .int()
      .min(0)
      .max(100_000)
      .nullable()
      .optional(),
    pinned: z.boolean().optional(),
  })
  .refine(
    (value) => Boolean(value.assignmentId) !== Boolean(value.localTaskId),
    'Provide exactly one task identifier.',
  );
const createSchema = z.object({
  title: z.string().min(1).max(500),
  courseId: z.number().int().positive().nullable().optional(),
  personalDueAt: z.iso.datetime().nullable().optional(),
  notes: z.string().max(100_000).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  initializeDatabase();
  const input = patchSchema.parse(await request.json());
  const at = new Date().toISOString();
  const task = input.assignmentId
    ? (getDb()
        .sqlite.prepare(
          `SELECT id FROM local_task_metadata WHERE assignment_id=?`,
        )
        .get(input.assignmentId) as { id: number } | undefined)
    : (getDb()
        .sqlite.prepare(`SELECT id FROM local_task_metadata WHERE id=?`)
        .get(input.localTaskId) as { id: number } | undefined);
  if (!task)
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of [
    ['workflowStatus', 'workflow_status'],
    ['notes', 'notes'],
    ['priority', 'priority'],
    ['personalDueAt', 'personal_due_at'],
    ['estimatedMinutes', 'estimated_minutes'],
    ['pinned', 'pinned'],
  ] as const)
    if (input[key] !== undefined) {
      fields.push(`${column}=?`);
      values.push(key === 'pinned' ? Number(input[key]) : input[key]);
    }
  fields.push('updated_at=?');
  values.push(at, task.id);
  getDb()
    .sqlite.prepare(
      `UPDATE local_task_metadata SET ${fields.join(',')} WHERE id=?`,
    )
    .run(...values);
  return NextResponse.json({ ok: true, id: task.id });
}

export async function POST(request: NextRequest) {
  initializeDatabase();
  const input = createSchema.parse(await request.json());
  return NextResponse.json(createLocalTask(input), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  initializeDatabase();
  const id = z.coerce
    .number()
    .int()
    .positive()
    .parse(request.nextUrl.searchParams.get('id'));
  // Only local tasks are deletable: a Canvas-backed row is a mirror that would
  // reappear on the next sync, minus the notes and priority it carried.
  const result = getDb()
    .sqlite.prepare(
      `DELETE FROM local_task_metadata WHERE id=? AND assignment_id IS NULL`,
    )
    .run(id);
  return result.changes
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Local task not found' }, { status: 404 });
}
