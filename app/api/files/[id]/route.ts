import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { dataDir, getDb, initializeDatabase } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  initializeDatabase();
  const { id } = await params;
  const row = getDb().sqlite.prepare(`SELECT local_path,filename,content_type FROM course_files WHERE id=?`).get(Number(id)) as { local_path: string | null; filename: string; content_type: string | null } | undefined;
  if (!row?.local_path) return NextResponse.json({ error: 'This file is not cached locally.' }, { status: 404 });
  const downloadsRoot = path.resolve(dataDir, 'downloads');
  const target = path.resolve(dataDir, row.local_path);
  if (!(target === downloadsRoot || target.startsWith(`${downloadsRoot}${path.sep}`)) || !fs.existsSync(target)) return NextResponse.json({ error: 'Cached file is unavailable.' }, { status: 404 });
  return new Response(fs.readFileSync(target), { headers: { 'Content-Type': row.content_type ?? 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`, 'Cache-Control': 'private, max-age=3600' } });
}
