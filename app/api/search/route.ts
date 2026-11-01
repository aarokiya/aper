import { NextRequest, NextResponse } from 'next/server';
import { searchLocal } from '@/lib/search/index';

export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json({ query, results: searchLocal(query) });
}
