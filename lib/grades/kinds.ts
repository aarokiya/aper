import { assignmentMatchKey } from '@/lib/grades/calculator';

/** Title without its numbers: "Programming Exercise 05" → "programming exercise". */
export function titleStem(title: string) {
  return assignmentMatchKey(title)
    .split(' ')
    .filter((token) => !/^\d+$/.test(token))
    .join(' ');
}

// Assignment kinds recognized in titles, Canvas group names, and syllabus
// lines, with how much a shared kind counts toward matching two of them.
export const KINDS: Record<string, { pattern: RegExp; weight: number }> = {
  final: { pattern: /\bfinals?\b/, weight: 2 },
  exam: {
    pattern: /\b(exams?|examinations?|midterms?|tests?|prelims?)\b/,
    weight: 2,
  },
  quiz: { pattern: /\b(quiz|quizzes|miniquiz(zes)?)\b/, weight: 2 },
  homework: {
    pattern: /\b(homeworks?|hw ?\d*|problem sets?|psets?|ps ?\d+)\b/,
    weight: 2,
  },
  lab: { pattern: /\b(labs?|laboratory)\b/, weight: 2 },
  project: { pattern: /\bprojects?\b/, weight: 2 },
  participation: {
    pattern:
      /\b(participation|attendance|engagement|in class|clickers?|polls?|activities)\b/,
    weight: 2,
  },
  programming: {
    pattern: /\b(programming|coding) (exercises?|assignments?)\b|\bpe ?\d+\b/,
    weight: 2,
  },
  exploration: { pattern: /\bexplorations?\b/, weight: 2 },
  recitation: { pattern: /\b(recitations?|studios?|workshops?)\b/, weight: 2 },
  reading: { pattern: /\breadings?\b/, weight: 2 },
  writing: {
    pattern: /\b(essays?|papers?|written assignments?|writing)\b/,
    weight: 2,
  },
  worksheet: { pattern: /\bworksheets?\b/, weight: 2 },
  wrapper: { pattern: /\bwrappers?\b/, weight: 2 },
  assignment: { pattern: /\bassignments?\b/, weight: 1 },
};

export function kindsOf(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return new Set(
    Object.keys(KINDS).filter((kind) => KINDS[kind].pattern.test(normalized)),
  );
}
