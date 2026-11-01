import { NextResponse } from 'next/server';
import { getAssignmentDetail } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const value = getAssignmentDetail(Number(id));
  return value ? NextResponse.json(value) : NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
}
