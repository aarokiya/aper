import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadGradeCourses } from '@/lib/grades/load';
import { buildPolicy } from '@/lib/grades/policy';
import { parseSyllabus } from '@/lib/grades/syllabus-parse';
import {
  canvasSyllabusText,
  courseFileSyllabusText,
  SyllabusTextError,
  syllabusTextFromFile,
} from '@/lib/grades/syllabus-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ courseId: string }> };

const MAX_BYTES = 10 * 1024 * 1024;

const jsonSchema = z.union([
  z.object({ source: z.literal('canvas') }),
  z.object({ source: z.literal('file'), fileId: z.number().int().positive() }),
  z.object({ text: z.string().trim().min(20).max(200_000) }),
]);

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

/**
 * Reads a syllabus (an upload, the Canvas syllabus page, a synced file, or
 * pasted text) and proposes grading rules mapped to the course's Canvas work.
 * Nothing is saved; PUT /api/grades/policy/:courseId adopts a proposal.
 */
export async function POST(request: Request, { params }: Context) {
  const courseId = Number((await params).courseId);
  const course = loadGradeCourses().find((entry) => entry.id === courseId);
  if (!course) return fail('Unknown course.', 404);

  let text: string;
  let source: string;
  // How the source reads mid-sentence.
  let where: string;
  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const file = (await request.formData()).get('file');
      if (!(file instanceof File)) return fail('Attach the syllabus file.');
      if (file.size > MAX_BYTES)
        return fail('That file is larger than 10 MB.', 413);
      text = await syllabusTextFromFile(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        file.type,
      );
      source = file.name;
      where = file.name;
    } else {
      const parsed = jsonSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return fail('Send a file, a Canvas source, or the syllabus text.');
      const body = parsed.data;
      if ('text' in body) {
        text = body.text;
        source = 'Pasted text';
        where = 'the pasted text';
      } else if (body.source === 'canvas') {
        const canvas = canvasSyllabusText(courseId);
        if (!canvas) return fail('Canvas has no syllabus text for this class.');
        text = canvas;
        source = 'Canvas syllabus';
        where = 'the Canvas syllabus';
      } else {
        const file = await courseFileSyllabusText(courseId, body.fileId);
        text = file.text;
        source = file.name;
        where = file.name;
      }
    }
  } catch (error) {
    if (error instanceof SyllabusTextError) return fail(error.message, 422);
    throw error;
  }

  const { policy, report } = buildPolicy(parseSyllabus(text), course, source);
  if (!policy)
    return fail(
      `No grading breakdown was found in ${where}. Try the file that lists the percentages, or paste that section.`,
      422,
    );
  return NextResponse.json({ policy, report });
}
