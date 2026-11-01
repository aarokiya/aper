import type { StudyGrade } from '@/lib/study/types';

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => entities[char]);

/**
 * The artifact's tiny markdown renderer for tutor answers. Everything is
 * escaped first; only fenced code, **bold**, `code`, bullet or numbered lines
 * (both become bullets), and paragraphs come back as HTML. An unclosed fence
 * runs to the end, so a half-streamed code block already renders as code.
 */
export function md(text: string) {
  const parts = String(text).split(/```[\w]*\n?([\s\S]*?)(?:```|$)/g);
  return parts
    .map((part, index) => {
      if (index % 2)
        return `<pre><code>${escapeHtml(part.replace(/\n$/, ''))}</code></pre>`;
      const lines = escapeHtml(part)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .split(/\n/);
      let out = '';
      let inList = false;
      for (const line of lines) {
        const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
        if (item) {
          if (!inList) out += '<ul>';
          inList = true;
          out += `<li>${item[1]}</li>`;
          continue;
        }
        if (inList) out += '</ul>';
        inList = false;
        if (line.trim()) out += `<p>${line}</p>`;
      }
      return out + (inList ? '</ul>' : '');
    })
    .join('');
}

export const VERDICT_LABEL: Record<StudyGrade['verdict'], string> = {
  correct: 'Full credit',
  partial: 'Partial credit',
  incorrect: 'Not yet',
};

/** What "Ask the tutor about this grade" attaches (artifact wording, with the grader renamed). */
export function gradeTutorContext(
  label: string,
  problem: string,
  reference: string,
  grade: StudyGrade,
) {
  const marks = grade.lines
    .map(
      (line) =>
        `[${line.mark}] ${line.text}${line.note ? ` (note: ${line.note})` : ''}`,
    )
    .join('\n');
  return {
    label: `Grade on ${label}`,
    text: `Problem: ${problem}\nReference: ${reference || 'none'}\nAI grade: ${grade.score}/${grade.max} (${grade.verdict}).\nStudent work as transcribed, with marks:\n${marks}\nMissing: ${grade.missing.join('; ') || 'nothing'}\nSummary: ${grade.summary}`,
    starter: 'Why did I lose points, and how do I fix it?',
  };
}

/** Tutor failure copy, keyed by error code; anything unlisted gets `fallback`. */
export const TUTOR_ERROR_COPY: Record<string, string> = {
  not_configured:
    'The tutor needs a Groq API key. Add one in Settings. Everything else still works.',
  rate_limited: 'Too many questions at once. Wait a minute, then ask again.',
  fallback: 'The tutor could not answer just now. Send your question again.',
};

/** Grader failure copy, keyed by error code; anything unlisted gets `fallback`. */
export const GRADE_ERROR_COPY: Record<string, string> = {
  cancelled: 'Stopped.',
  not_configured: 'Grading needs a Groq API key. Add one in Settings.',
  rate_limited: 'Too many requests right now. Wait a minute, then try again.',
  image_rejected: "That photo couldn't be used. Try a smaller JPG or PNG.",
  invalid_json: 'The grade came back garbled. Press Grade it to try again.',
  fallback: 'Grading failed. Press Grade it to try again.',
};
