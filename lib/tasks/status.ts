export type ProviderSubmission = {
  workflowState?: string | null;
  submittedAt?: string | null;
  score?: number | null;
  gradedAt?: string | null;
  missing?: boolean | null;
  late?: boolean | null;
  excused?: boolean | null;
};

export type ProviderState = 'UNSUBMITTED' | 'SUBMITTED' | 'GRADED' | 'EXCUSED';

export type LocalWorkflowStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE_LOCALLY'
  | 'SUBMITTED'
  | 'GRADED';

const completedProviderStates = new Set<ProviderState>([
  'SUBMITTED',
  'GRADED',
  'EXCUSED',
]);
const completedLocalStatuses = new Set<LocalWorkflowStatus>([
  'DONE_LOCALLY',
  'SUBMITTED',
  'GRADED',
]);

export function isTaskComplete(
  providerState: string | null | undefined,
  workflowStatus: string | null | undefined,
) {
  return (
    completedProviderStates.has(providerState as ProviderState) ||
    completedLocalStatuses.has(workflowStatus as LocalWorkflowStatus)
  );
}

export function normalizeProviderState(
  submission?: ProviderSubmission | null,
): ProviderState {
  if (submission?.excused) return 'EXCUSED';
  if (submission?.gradedAt || submission?.workflowState === 'graded')
    return 'GRADED';
  if (
    submission?.submittedAt ||
    ['submitted', 'pending_review'].includes(submission?.workflowState ?? '')
  )
    return 'SUBMITTED';
  return 'UNSUBMITTED';
}

export function isActionableOverdue(
  dueAt: string | null | undefined,
  providerState: ProviderState,
  now = new Date(),
) {
  return Boolean(
    dueAt &&
    new Date(dueAt).getTime() < now.getTime() &&
    providerState === 'UNSUBMITTED',
  );
}

export function urgencyScore(
  input: {
    dueAt?: string | null;
    providerState: ProviderState;
    priority?: number | null;
    pointsPossible?: number | null;
  },
  now = new Date(),
) {
  if (input.providerState !== 'UNSUBMITTED' || !input.dueAt) return 0;
  const hours = (new Date(input.dueAt).getTime() - now.getTime()) / 3_600_000;
  const timeScore =
    hours < 0
      ? 1000 + Math.min(300, Math.abs(hours))
      : Math.max(0, 500 - hours * 5);
  return (
    timeScore +
    (input.priority ?? 0) * 75 +
    Math.min(input.pointsPossible ?? 0, 100)
  );
}
