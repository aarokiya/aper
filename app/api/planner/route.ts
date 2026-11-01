import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPlan,
  getPlannerFile,
  importPlannerFile,
  resetPlan,
  savePlan,
} from '@/lib/planner/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_FILE = 'Import a planner file first.';

/** The JSON body, or the error response to send instead. */
async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 1_000_000)
    return NextResponse.json(
      { error: 'That is too large for a plan.' },
      { status: 413 },
    );
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return NextResponse.json(
      { error: 'Send the plan as JSON.' },
      { status: 400 },
    );
  }
}

/** The imported planner file and your plan. */
export function GET() {
  const file = getPlannerFile();
  if (!file) return NextResponse.json({ error: NO_FILE }, { status: 404 });
  return NextResponse.json({ file, plan: getPlan(file) });
}

/** Saves your plan (local only). */
export async function PUT(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  if (!getPlannerFile())
    return NextResponse.json({ error: NO_FILE }, { status: 409 });
  try {
    return NextResponse.json(savePlan(body.value));
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(' ') },
        { status: 400 },
      );
    throw error;
  }
}

/**
 * Imports a planner file: degree requirements plus a starting plan. A saved
 * plan that is newer than the file's is kept.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    return NextResponse.json(importPlannerFile(body.value));
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: `That isn't a planner file. ${error.issues
            .slice(0, 3)
            .map(
              (issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`,
            )
            .join('; ')}`,
        },
        { status: 400 },
      );
    throw error;
  }
}

/** Puts the imported starting plan back. */
export function DELETE() {
  const file = getPlannerFile();
  if (!file) return NextResponse.json({ error: NO_FILE }, { status: 409 });
  return NextResponse.json(resetPlan(file));
}
