import { NextRequest, NextResponse } from 'next/server';
import {
  calculatorStateSchema,
  getCalculatorState,
  saveCalculatorState,
} from '@/lib/grades/load';

export const dynamic = 'force-dynamic';

// Local-only what-if state. Nothing here is sent to Canvas or Gradescope.
export function GET() {
  return NextResponse.json(getCalculatorState());
}

export async function PUT(request: NextRequest) {
  const parsed = calculatorStateSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  saveCalculatorState(parsed.data);
  return NextResponse.json({ ok: true });
}
