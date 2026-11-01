/** Priority assigned to work that looks like a project. */
export const PROJECT_PRIORITY = 3;
/** Anything at or above this lands in the Today page's "Needs attention" list. */
export const ATTENTION_PRIORITY = 2;

const projectKeywords =
  /\b(project|capstone|milestone|deliverable|prototype|design\s+doc(ument)?)\b/i;

export function isProjectTitle(title: string | null | undefined) {
  return Boolean(title) && projectKeywords.test(String(title));
}

/** Needs-attention only looks this far ahead; anything later waits its turn. */
export const ATTENTION_HORIZON_DAYS = 30;

export type AttentionCandidate = {
  dueAt: string | null;
  personalDueAt?: string | null;
  /** Overdue or due today. */
  urgent: boolean;
  priority: number;
};

const dueTime = (task: AttentionCandidate) => {
  const due = task.personalDueAt ?? task.dueAt;
  return due ? new Date(due).getTime() : Number.POSITIVE_INFINITY;
};

export function withinAttentionHorizon(
  task: AttentionCandidate,
  now: Date = new Date(),
) {
  const due = dueTime(task);
  if (!Number.isFinite(due)) return true;
  return due <= now.getTime() + ATTENTION_HORIZON_DAYS * 86_400_000;
}

/**
 * Needs attention = overdue/due today, plus prioritised work due within the
 * horizon. Urgent items always sort above prioritised ones; ties break on the
 * closest deadline.
 */
export function selectAttention<T extends AttentionCandidate>(
  tasks: T[],
  now: Date = new Date(),
) {
  return tasks
    .filter(
      (task) =>
        (task.urgent || task.priority >= ATTENTION_PRIORITY) &&
        withinAttentionHorizon(task, now),
    )
    .sort(
      (a, b) => Number(b.urgent) - Number(a.urgent) || dueTime(a) - dueTime(b),
    );
}
