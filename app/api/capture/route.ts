import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLocalTask, getDashboardData } from '@/lib/db/queries';
import { captureTask, type CapturedTask } from '@/lib/groq/capture';
import { groqEnabled } from '@/lib/groq/client';

export const dynamic = 'force-dynamic';

const schema = z.object({ text: z.string().min(1).max(2_000) });
const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function POST(request: NextRequest) {
  const { text } = schema.parse(await request.json());
  const courses = getDashboardData().courses;
  let captured: CapturedTask = {
    title: text.trim(),
    notes: '',
    personalDueAt: null,
    priority: 0,
    courseCode: null,
  };
  let parsed = false;
  let error: string | null = null;
  if (groqEnabled()) {
    try {
      captured = await captureTask(
        text,
        courses.map((course) => course.code),
      );
      parsed = true;
    } catch (thrown) {
      // A failed parse must never lose the capture: it goes back to the editor.
      error = thrown instanceof Error ? thrown.message : 'groq: failed';
    }
  } else {
    error = 'groq: not configured';
  }
  // A capture the model could not read is handed back for the manual editor
  // rather than saved as a bare title, which keeps junk rows out of the DB.
  if (!parsed) return NextResponse.json({ parsed, error, text: text.trim() });
  const wanted = captured.courseCode ? normalize(captured.courseCode) : null;
  const course = wanted
    ? courses.find((item) => {
        const code = normalize(item.code);
        return code === wanted || code.includes(wanted) || wanted.includes(code);
      })
    : undefined;
  const row = createLocalTask({
    title: captured.title,
    courseId: course?.id ?? null,
    notes: captured.notes,
    personalDueAt: captured.personalDueAt,
    priority: captured.priority,
  });
  return NextResponse.json(
    {
      id: row.id,
      parsed,
      error,
      title: captured.title,
      personalDueAt: captured.personalDueAt,
      course: course?.code ?? null,
    },
    { status: 201 },
  );
}
