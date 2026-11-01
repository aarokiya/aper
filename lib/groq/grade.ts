import { GroqError } from '@/lib/groq/client';
import type { StudyCourse, StudyGrade } from '@/lib/study/types';

/** Groq's vision model takes at most three images per request. */
export const GRADE_MAX_IMAGES = 3;
/** Per photo, after the browser has downscaled it. */
export const GRADE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** All photos together; base64 grows them by a third and Groq caps a request at 20 MB. */
export const GRADE_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export const GRADE_MAX_TEXT = 20_000;
export const GRADE_MAX_POINTS = 1_000;

const verdicts: Record<StudyGrade['verdict'], true> = {
  correct: true,
  partial: true,
  incorrect: true,
};
const marks: Record<StudyGrade['lines'][number]['mark'], true> = {
  ok: true,
  error: true,
  neutral: true,
};

/** The artifact's grade prompt, verbatim. */
export function gradePrompt(
  course: Pick<StudyCourse, 'tutor' | 'math'>,
  problem: string,
  reference: string,
  pts: number,
  typed: string,
) {
  return `You are a fair, careful TA grading a student's work for ${course.tutor.split('. ')[0]}.

Problem (worth ${pts} points):
${problem}

Reference solution (one correct approach; accept any valid approach):
${reference || '(none provided: decide correctness yourself)'}

${typed ? 'Student work (typed):\n' + typed : "The attached image(s) show the student's handwritten work for this problem, in order."}

How to grade:
- Transcribe the student's work line by line, as written. Use Unicode math symbols${course.math ? ' or plain TeX' : ''}. Keep lines short; split long ones. For code, transcribe each code line exactly.
- Mark each line "ok" if it is correct and justified, "error" if it has a mistake, a gap, an unjustified claim, or wrong logic, and "neutral" for labels or restatements.
- For each "error" line, add a short teacher's note (at most 15 words) saying exactly what is wrong.
- List important steps that are missing entirely.
- Score out of ${pts}: full credit for a complete, correct answer by any valid method; partial credit in proportion to correct progress. If a rubric is given, apply it item by item. For handwritten code, small syntax slips cost little; wrong logic costs more. Use whole or half points.
- If the work is blank, unreadable, or not an attempt at this problem, set "readable" to false.

Reply with only JSON in this shape:
{"readable": true, "score": 7, "max": ${pts}, "verdict": "correct" | "partial" | "incorrect", "lines": [{"text": "…", "mark": "ok" | "error" | "neutral", "note": ""}], "missing": ["…"], "summary": "one or two sentences", "next": "the single most important fix"}`;
}

/**
 * Reads the model's reply as JSON. JSON mode normally guarantees a bare
 * object, but OpenAI-compatible servers without it wrap the object in a code
 * fence or a sentence, so the outermost braces are tried before giving up.
 */
export function parseGradeJson(content: string): unknown {
  const text = content.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Fall through to the typed error below.
      }
    }
    throw new GroqError('invalid_json', 'invalid json');
  }
}

type RawGrade = {
  readable?: unknown;
  score?: unknown;
  verdict?: unknown;
  lines?: unknown;
  missing?: unknown;
  summary?: unknown;
  next?: unknown;
};

type RawLine =
  | { text?: unknown; mark?: unknown; note?: unknown }
  | null
  | undefined;

/**
 * The artifact's `clean()`: clamps the score to 0..pts in half points, keeps
 * only known verdicts and marks (deriving the verdict from the score when the
 * model's is missing), caps every list and string, and drops the transcript
 * when the work was unreadable. `max` is always the caller's points.
 */
export function cleanGrade(
  raw: unknown,
  pts: number,
  now = Date.now(),
): StudyGrade {
  if (!raw || typeof raw !== 'object')
    throw new GroqError('invalid_json', 'invalid json');
  const g = raw as RawGrade;
  const readable = g.readable !== false;
  const score = Math.max(
    0,
    Math.min(pts, Math.round((Number(g.score) || 0) * 2) / 2),
  );
  const verdict =
    typeof g.verdict === 'string' && Object.hasOwn(verdicts, g.verdict)
      ? (g.verdict as StudyGrade['verdict'])
      : score >= pts
        ? 'correct'
        : score > 0
          ? 'partial'
          : 'incorrect';
  const lines = (Array.isArray(g.lines) ? (g.lines as RawLine[]) : [])
    .slice(0, 80)
    .map((line) => ({
      text: String(line?.text ?? '').slice(0, 300),
      mark:
        typeof line?.mark === 'string' && Object.hasOwn(marks, line.mark)
          ? (line.mark as StudyGrade['lines'][number]['mark'])
          : 'neutral',
      note: String(line?.note ?? '').slice(0, 200),
    }))
    .filter((line) => line.text.trim());
  const missing = (Array.isArray(g.missing) ? (g.missing as unknown[]) : [])
    .slice(0, 8)
    .map((item) => String(item).slice(0, 200));
  return {
    readable,
    max: pts,
    at: now,
    score,
    verdict,
    lines: readable ? lines : [],
    missing: readable ? missing : [],
    summary: String(g.summary || '').slice(0, 500),
    next: String(g.next || '').slice(0, 300),
  };
}
