export function scorePercentage(
  score: number | null | undefined,
  pointsPossible: number | null | undefined,
) {
  if (score == null || pointsPossible == null || pointsPossible <= 0)
    return null;
  return (score / pointsPossible) * 100;
}

export function scoreColorClass(percentage: number | null) {
  if (percentage == null) return 'text-foreground';
  if (percentage >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (percentage >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}
