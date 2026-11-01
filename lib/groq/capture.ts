import { groqChat } from '@/lib/groq/client';
import { zonedTimeToUtcIso } from '@/lib/sync/dates';
import { APP_TIME_ZONE as timeZone } from '@/lib/time-zone';

export type CapturedTask = {
  title: string;
  notes: string;
  personalDueAt: string | null;
  priority: number;
  courseCode: string | null;
};

/**
 * The model is forbidden from doing date arithmetic and handed a lookup table
 * instead: asked to compute, it returns dates off by weeks; asked to read one
 * off a calendar, it is reliable, and the timezone conversion happens here.
 */
export function capturePrompt(now: Date, courseCodes: string[]) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const calendar = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getTime() + index * 86_400_000);
    const parts = Object.fromEntries(
      day.formatToParts(date).map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}(${parts.weekday})`;
  }).join(' ');
  const courses = courseCodes.length ? courseCodes.join(', ') : 'none known';
  return `You extract a single task from the user's text. Reply ONLY with JSON:
{"title":string,"notes":string,"startLocal":"YYYY-MM-DDTHH:MM" or null,"priority":"low"|"normal"|"high","courseCode":string or null}
Rules:
- title is short and imperative. notes holds any leftover detail, else "".
- Resolve dates ONLY by looking them up in the calendar below. Never compute a date yourself. Never output a unix timestamp.
- If the text names no time, startLocal is null. Times of day: morning=09:00, noon=12:00, afternoon=14:00, evening=19:00, night=21:00.
- priority is "high" only if the text signals urgency (urgent, asap, deadline, exam, must). Otherwise "normal".
- courseCode is one of these enrolled courses when the text names a class, else null: ${courses}.
Now: ${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)} (${timeZone}). Calendar: ${calendar}`;
}

/**
 * Parsing is separated from the HTTP call because parsing is the part that
 * actually breaks. A capture is never dropped: a missing title falls back to
 * the raw text, and an unreadable date leaves the task undated with the
 * original string kept in notes.
 */
export function parseCapture(content: string, original: string): CapturedTask {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(content.trim()) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const title =
    (typeof raw.title === 'string' && raw.title.trim()) || original.trim();
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
  const priority = raw.priority === 'high' ? 3 : 0;
  const courseCode =
    typeof raw.courseCode === 'string' && raw.courseCode.trim()
      ? raw.courseCode.trim()
      : null;
  const startLocal = typeof raw.startLocal === 'string' ? raw.startLocal : '';
  if (!startLocal) return { title, notes, personalDueAt: null, priority, courseCode };
  const personalDueAt = zonedTimeToUtcIso(startLocal, timeZone);
  return personalDueAt
    ? { title, notes, personalDueAt, priority, courseCode }
    : {
        title,
        notes: `${notes} (unparsed time: ${startLocal})`.trim(),
        personalDueAt: null,
        priority,
        courseCode,
      };
}

/** Calls Groq for one capture. Throws a GroqError when it is unconfigured or unhappy. */
export async function captureTask(
  text: string,
  courseCodes: string[],
  now = new Date(),
): Promise<CapturedTask> {
  const content = await groqChat({
    json: true,
    temperature: 0,
    messages: [
      { role: 'system', content: capturePrompt(now, courseCodes) },
      { role: 'user', content: text },
    ],
  });
  return parseCapture(content, text);
}
