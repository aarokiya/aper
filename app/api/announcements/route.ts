import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export function GET() {
  initializeDatabase();
  return NextResponse.json(getDb().sqlite.prepare(`SELECT n.id,n.title,n.message_text AS message,n.author_name AS author,n.posted_at AS postedAt,n.edited_at AS editedAt,n.source_url AS sourceUrl,COALESCE(c.local_alias,c.course_code,c.name) AS course FROM announcements n JOIN courses c ON c.id=n.course_id ORDER BY n.posted_at DESC LIMIT 200`).all());
}
