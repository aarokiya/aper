import { NextResponse } from 'next/server';
import {
  GROQ_ERROR_STATUS,
  GroqError,
  groqChat,
  groqEnabled,
  groqTextModel,
  groqVisionModel,
  type GroqContentPart,
} from '@/lib/groq/client';
import {
  GRADE_MAX_IMAGE_BYTES,
  GRADE_MAX_IMAGES,
  GRADE_MAX_POINTS,
  GRADE_MAX_TEXT,
  GRADE_MAX_TOTAL_BYTES,
  cleanGrade,
  gradePrompt,
  parseGradeJson,
} from '@/lib/groq/grade';
import { getStudyCourse } from '@/lib/study/hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The formats Groq's vision model reads, identified by content rather than by the browser's label. */
function sniffImage(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return 'image/gif';
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

const rejected = (code: string, error: string, status = 400) =>
  NextResponse.json({ code, error }, { status });

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Grades one answer: multipart `courseId`, `problem`, `reference`, `points`,
 * and either `typed` or up to three `images`. Typed work goes to the text
 * model, photos and drawings to the vision model as data URLs, both in JSON
 * mode; the reply is sanitized with the artifact's rules before it returns.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return rejected('invalid_request', 'Send the work as a form upload.');
  }
  const course = getStudyCourse(text(form, 'courseId'));
  if (!course)
    return rejected(
      'unknown_course',
      'That course is not in the Study Hub.',
      404,
    );
  if (!groqEnabled())
    return NextResponse.json(
      { code: 'not_configured' },
      { status: GROQ_ERROR_STATUS.not_configured },
    );

  const problem = text(form, 'problem');
  const reference = text(form, 'reference');
  const typed = text(form, 'typed');
  const points = Number(text(form, 'points'));
  if (!problem)
    return rejected('invalid_request', 'Type the problem statement first.');
  if (
    [problem, reference, typed].some((value) => value.length > GRADE_MAX_TEXT)
  )
    return rejected(
      'invalid_request',
      'That is too much text to grade at once.',
    );
  if (!Number.isFinite(points) || points < 1 || points > GRADE_MAX_POINTS)
    return rejected(
      'invalid_request',
      `Points must be between 1 and ${GRADE_MAX_POINTS}.`,
    );

  const files = form.getAll('images');
  if (files.some((file) => typeof file === 'string'))
    return rejected('invalid_request', 'Images must be files.');
  const images = files as File[];
  if (!typed && !images.length)
    return rejected('invalid_request', 'Add your work first.');
  if (typed && images.length)
    return rejected('invalid_request', 'Send typed work or photos, not both.');
  if (images.length > GRADE_MAX_IMAGES)
    return rejected(
      'image_rejected',
      `Use at most ${GRADE_MAX_IMAGES} pages.`,
      413,
    );
  if (images.some((file) => file.size > GRADE_MAX_IMAGE_BYTES))
    return rejected('image_rejected', 'That photo is too large.', 413);
  if (images.reduce((sum, file) => sum + file.size, 0) > GRADE_MAX_TOTAL_BYTES)
    return rejected(
      'image_rejected',
      'Those photos are too large together.',
      413,
    );

  const parts: GroqContentPart[] = [];
  for (const file of images) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type)
      return rejected(
        'image_rejected',
        'Use a JPG, PNG, WebP, or GIF image.',
        415,
      );
    parts.push({
      type: 'image_url',
      image_url: {
        url: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
      },
    });
  }

  const prompt = gradePrompt(course, problem, reference, points, typed);
  try {
    const content = await groqChat({
      model: parts.length ? groqVisionModel() : groqTextModel(),
      messages: [
        {
          role: 'user',
          content: parts.length
            ? [{ type: 'text', text: prompt }, ...parts]
            : prompt,
        },
      ],
      json: true,
      temperature: 0,
      maxTokens: 4_096,
      signal: request.signal,
      timeoutMs: 90_000,
    });
    return NextResponse.json(cleanGrade(parseGradeJson(content), points));
  } catch (error) {
    const code = error instanceof GroqError ? error.code : 'http';
    return NextResponse.json({ code }, { status: GROQ_ERROR_STATUS[code] });
  }
}
