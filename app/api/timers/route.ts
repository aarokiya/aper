import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, initializeDatabase } from '@/lib/db/client';

const schema = z.object({ localTaskId: z.number().int().positive(), action: z.enum(['start','stop']) });
export async function POST(request: NextRequest) {
  initializeDatabase(); const input = schema.parse(await request.json()); const { sqlite } = getDb(); const at = new Date().toISOString();
  if (input.action === 'start') {
    const active = sqlite.prepare(`SELECT id FROM timer_sessions WHERE local_task_id=? AND ended_at IS NULL`).get(input.localTaskId) as { id: number } | undefined;
    if (active) return NextResponse.json(active);
    return NextResponse.json(sqlite.prepare(`INSERT INTO timer_sessions (local_task_id,started_at) VALUES (?,?) RETURNING id,started_at AS startedAt`).get(input.localTaskId, at), { status: 201 });
  }
  const active = sqlite.prepare(`SELECT id,started_at FROM timer_sessions WHERE local_task_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1`).get(input.localTaskId) as { id: number; started_at: string } | undefined;
  if (!active) return NextResponse.json({ error: 'No active timer' }, { status: 404 });
  const duration = Math.max(0, Math.round((Date.now() - new Date(active.started_at).getTime()) / 1000)); sqlite.prepare(`UPDATE timer_sessions SET ended_at=?,duration_seconds=? WHERE id=?`).run(at, duration, active.id);
  return NextResponse.json({ id: active.id, endedAt: at, durationSeconds: duration });
}
