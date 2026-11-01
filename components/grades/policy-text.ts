import type { GradeCourse } from '@/lib/grades/calculator';
import type { PolicyComponent, PolicySource } from '@/lib/grades/policy';

const num = (value: number) => String(+value.toFixed(2));

/** "Best 25%, next 20%, lowest 15%", "Each counts equally, drops the lowest 1". */
export function describeScoring(component: PolicyComponent) {
  const { scoring, dropLowest } = component;
  const base =
    scoring.kind === 'equal'
      ? 'Each counts equally'
      : scoring.kind === 'ranked'
        ? scoring.weights
            .map((weight, index) =>
              index === 0
                ? `Best ${num(weight)}%`
                : index === scoring.weights.length - 1
                  ? `lowest ${num(weight)}%`
                  : `next ${num(weight)}%`,
            )
            .join(', ')
        : scoring.kind === 'pool'
          ? `Points out of ${num(scoring.cap)}, capped at 100%`
          : 'By points';
  return dropLowest > 0 ? `${base}, drops the lowest ${dropLowest}` : base;
}

/** Plain names for a course's Canvas groups and assignments, by id. */
export type SourceNames = {
  groups: Map<number, string>;
  items: Map<number, string>;
};

export function sourceNames(course: GradeCourse): SourceNames {
  const groups = new Map<number, string>();
  const items = new Map<number, string>();
  for (const category of course.categories) {
    if (typeof category.id === 'number') groups.set(category.id, category.name);
    for (const item of category.items) items.set(item.id, item.title);
  }
  return { groups, items };
}

/** "Homework", "Course Grade: “final exam”", "Assignments: everything else", "WeBWorK ×0.2". */
export function describeSource(source: PolicySource, names: SourceNames) {
  const group =
    source.group == null
      ? null
      : (names.groups.get(source.group) ?? 'A Canvas group that is gone');
  const label =
    source.item != null
      ? (names.items.get(source.item) ?? 'An assignment that is gone')
      : source.words
        ? `${group}: “${source.words.join(' ')}”`
        : source.kind
          ? `${group}: ${source.kind} work`
          : source.rest
            ? `${group}: everything else`
            : group!;
  return source.scale != null && source.scale !== 1
    ? `${label} ×${num(source.scale)}`
    : label;
}

/** Sources as one phrase; either/or pool sources read "the larger of A or B". */
export function describeSources(sources: PolicySource[], names: SourceNames) {
  // Each entry is a phrase, or the list of alternatives sharing a choice.
  const entries: Array<string | string[]> = [];
  const choices = new Map<string, string[]>();
  for (const source of sources) {
    const text = describeSource(source, names);
    const set = source.choice == null ? null : choices.get(source.choice);
    if (source.choice == null) entries.push(text);
    else if (set) set.push(text);
    else {
      const created = [text];
      choices.set(source.choice, created);
      entries.push(created);
    }
  }
  return entries
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : entry.length > 1
          ? `the larger of ${entry.join(' or ')}`
          : entry[0],
    )
    .join(', ');
}
