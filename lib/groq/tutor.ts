import type { GroqErrorCode, GroqMessage } from '@/lib/groq/client';
import type { StudyCourse } from '@/lib/study/types';

export type TutorTurn = { role: 'user' | 'assistant'; content: string };
export type TutorContext = { label: string; text: string };

/** The tutor sees at most this many turns, so old context ages out (artifact behaviour). */
export const TUTOR_MAX_TURNS = 12;

/**
 * The tutor response is plain text. A record separator, which never appears
 * in model prose, introduces an optional trailer: `truncated` when the answer
 * hit the token cap, or a GroqErrorCode when the stream failed part-way.
 */
export const TUTOR_TRAILER = '\u001e';

export type TutorTrailer = 'truncated' | GroqErrorCode;

/** The artifact's tutor rules, verbatim. */
export function tutorRules(course: Pick<StudyCourse, 'tutor' | 'math'>) {
  return `You are a patient tutor for ${course.tutor}. The student wants explanations that make problems simple to solve. Rules: explain in plain language and short steps; ${course.math ? 'write math in TeX between single dollar signs' : 'use Unicode math symbols (∀ ∃ ¬ ∧ ∨ → ⊆ ≡), never LaTeX'}; put code in fenced blocks; keep answers under 220 words unless asked for more; when the student has an answer wrong, point to the exact misstep; when they ask for help starting, give the first move and a question rather than the full solution. Do not write homework submissions for them.`;
}

/**
 * Rules, then the conversation. The first student turn carries the attached
 * context, and only the last TUTOR_MAX_TURNS turns are sent, so after about
 * six exchanges the context drops out exactly as it did in the artifact.
 */
export function tutorMessages(
  course: Pick<StudyCourse, 'tutor' | 'math'>,
  turns: TutorTurn[],
  context: TutorContext | null,
): GroqMessage[] {
  const wrapped = turns.map((turn, index) =>
    index === 0 && turn.role === 'user' && context
      ? {
          role: turn.role,
          content: `Context:\n${context.text}\n\nStudent question: ${turn.content}`,
        }
      : turn,
  );
  return [
    { role: 'system', content: tutorRules(course) },
    ...wrapped.slice(-TUTOR_MAX_TURNS),
  ];
}
