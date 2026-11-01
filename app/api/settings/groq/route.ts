import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clearGroqKey, groqKeyStatus, saveGroqKey } from '@/lib/groq/key-store';

export const dynamic = 'force-dynamic';

const schema = z.object({ key: z.string().min(1).max(500) });

// The key itself is never returned: responses carry only a masked hint.
export function GET() {
  return NextResponse.json(groqKeyStatus());
}

export async function POST(request: NextRequest) {
  const { key } = schema.parse(await request.json());
  try {
    return NextResponse.json(saveGroqKey(key));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save key' },
      { status: 400 },
    );
  }
}

export function DELETE() {
  return NextResponse.json(clearGroqKey());
}
