/**
 * The one-sentence summary under Today's greeting, composed from live
 * counts: "Two items are overdue and one is due today and ABC 1234 Exam 1 is
 * in 6 days."
 */
export type SummaryInput = {
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
  exam: { code: string; title: string; days: number } | null;
};

const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

const count = (n: number) => WORDS[n] ?? String(n);

function workClause({ overdue, dueToday, dueTomorrow }: SummaryInput) {
  const verb = (n: number) => (n === 1 ? 'is' : 'are');
  if (overdue && dueToday)
    return `${count(overdue)} ${overdue === 1 ? 'item' : 'items'} ${verb(overdue)} overdue and ${count(dueToday)} ${verb(dueToday)} due today`;
  if (overdue)
    return `${count(overdue)} ${overdue === 1 ? 'item' : 'items'} ${verb(overdue)} overdue`;
  if (dueToday)
    return `${count(dueToday)} ${dueToday === 1 ? 'thing' : 'things'} ${verb(dueToday)} due today`;
  if (dueTomorrow)
    return `nothing is due today but ${count(dueTomorrow)} ${dueTomorrow === 1 ? 'thing is' : 'things are'} due tomorrow`;
  return 'nothing is due today';
}

export function composeSummary(input: SummaryInput) {
  const clauses = [workClause(input)];
  if (input.exam) {
    const { code, title, days } = input.exam;
    const when =
      days === 0
        ? 'is today'
        : days === 1
          ? 'is tomorrow'
          : `is in ${days} days`;
    clauses.push(`${code} ${title} ${when}`);
  }
  const sentence = clauses.join(' and ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
