export type WorkItemCandidate = { provider: string; courseSourceId: string; title: string; dueAt?: string | null; externalUrl?: string | null; linkedCanvasAssignmentId?: string | null };

export type MatchResult = { decision: 'MERGE' | 'POSSIBLE' | 'SEPARATE'; confidence: number; reason: string };

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchWorkItems(a: WorkItemCandidate, b: WorkItemCandidate): MatchResult {
  if (a.provider === b.provider) return { decision: 'SEPARATE', confidence: 1, reason: 'Same-provider records remain distinct without an explicit link.' };
  if (a.linkedCanvasAssignmentId && a.linkedCanvasAssignmentId === b.linkedCanvasAssignmentId) return { decision: 'MERGE', confidence: 1, reason: 'Explicit Canvas assignment link.' };
  if (a.externalUrl && b.externalUrl && new URL(a.externalUrl).pathname === new URL(b.externalUrl).pathname) return { decision: 'MERGE', confidence: 0.98, reason: 'Exact external resource path.' };
  if (a.courseSourceId !== b.courseSourceId) return { decision: 'SEPARATE', confidence: 1, reason: 'Different courses.' };
  const sameTitle = normalized(a.title) === normalized(b.title);
  const dueDistance = a.dueAt && b.dueAt ? Math.abs(new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) : Number.POSITIVE_INFINITY;
  if (sameTitle && dueDistance <= 5 * 60_000) return { decision: 'POSSIBLE', confidence: 0.82, reason: 'Exact normalized title and near-identical deadline; review before merge.' };
  return { decision: 'SEPARATE', confidence: 0.8, reason: 'No strong source relationship.' };
}
