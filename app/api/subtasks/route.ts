import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';

const createSchema = z.object({
  localTaskId: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
});
const patchSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  initializeDatabase();
  const input = createSchema.parse(await request.json());
  const position = (
    getDb()
      .sqlite.prepare(
        `SELECT COALESCE(MAX(position),-1)+1 AS value FROM subtasks WHERE local_task_id=?`,
      )
      .get(input.localTaskId) as { value: number }
  ).value;
  const row = getDb()
    .sqlite.prepare(
      `INSERT INTO subtasks (local_task_id,title,completed,position) VALUES (?,?,0,?) RETURNING id,local_task_id AS localTaskId,title,completed,position`,
    )
    .get(input.localTaskId, input.title, position);
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  initializeDatabase();
  const input = patchSchema.parse(await request.json());
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) {
    fields.push('title=?');
    values.push(input.title);
  }
  if (input.completed !== undefined) {
    fields.push('completed=?');
    values.push(Number(input.completed));
  }
  if (input.position !== undefined) {
    fields.push('position=?');
    values.push(input.position);
  }
  if (!fields.length) return NextResponse.json({ ok: true, id: input.id });
  values.push(input.id);
  const result = getDb()
    .sqlite.prepare(`UPDATE subtasks SET ${fields.join(',')} WHERE id=?`)
    .run(...values);
  return result.changes
    ? NextResponse.json({ ok: true, id: input.id })
    : NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
}

export async function DELETE(request: NextRequest) {
  initializeDatabase();
  const id = z.coerce
    .number()
    .int()
    .positive()
    .parse(request.nextUrl.searchParams.get('id'));
  const result = getDb()
    .sqlite.prepare(`DELETE FROM subtasks WHERE id=?`)
    .run(id);
  return result.changes
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
}
