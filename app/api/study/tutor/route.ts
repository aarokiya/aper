import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GROQ_ERROR_STATUS,
  GroqError,
  groqEnabled,
  groqStream,
} from '@/lib/groq/client';
import {
  TUTOR_TRAILER,
  tutorMessages,
  type TutorTrailer,
} from '@/lib/groq/tutor';
import { getStudyCourse } from '@/lib/study/hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  courseId: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(400),
  context: z
    .object({ label: z.string().max(500), text: z.string().max(40_000) })
    .nullish(),
});

const failed = (error: unknown) => {
  const code = error instanceof GroqError ? error.code : 'http';
  return NextResponse.json({ code }, { status: GROQ_ERROR_STATUS[code] });
};

/**
 * Streams the tutor's answer as plain text. Failures before the first token
 * answer with `{ code }` and a status; failures part-way through end the text
 * with a trailer (see TUTOR_TRAILER). Closing the request aborts the upstream
 * call, so Stop and Close in the drawer cost nothing further.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  }
  const course = getStudyCourse(body.courseId);
  if (!course)
    return NextResponse.json({ code: 'unknown_course' }, { status: 404 });
  if (body.messages.at(-1)?.role !== 'user')
    return NextResponse.json({ code: 'invalid_request' }, { status: 400 });
  if (!groqEnabled())
    return failed(new GroqError('not_configured', 'not configured'));

  let finish: string | null = null;
  let upstream: ReadableStream<string>;
  try {
    upstream = await groqStream({
      messages: tutorMessages(course, body.messages, body.context ?? null),
      temperature: 0.4,
      maxTokens: 1_200,
      signal: request.signal,
      timeoutMs: 90_000,
      onFinish: (reason) => {
        finish = reason;
      },
    });
  } catch (error) {
    return failed(error);
  }

  const encoder = new TextEncoder();
  const reader = upstream.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(encoder.encode(value));
          return;
        }
        if (finish === 'length')
          controller.enqueue(encoder.encode(`${TUTOR_TRAILER}truncated`));
        controller.close();
      } catch (error) {
        const code = error instanceof GroqError ? error.code : 'http';
        // A cancelled stream means the student left; nobody is reading.
        if (code !== 'cancelled')
          controller.enqueue(
            encoder.encode(`${TUTOR_TRAILER}${code satisfies TutorTrailer}`),
          );
        controller.close();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // no-transform keeps the compression layer from buffering the stream.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
