import fs from 'node:fs';
import { z } from 'zod';
import { importPlannerFile } from '@/lib/planner/store';

const target = process.argv[2];
if (!target) {
  console.error('Usage: pnpm planner:import <planner file .json>');
  process.exit(1);
}

try {
  const { file, keptSaved } = importPlannerFile(
    JSON.parse(fs.readFileSync(target, 'utf8')),
  );
  const count = file.areas.reduce((total, area) => total + area.reqs.length, 0);
  console.log(
    `Imported "${file.program}": ${count} requirements from the Degree Works audit of ${file.audit}.`,
  );
  console.log(
    keptSaved
      ? 'Your saved plan is newer than the file’s, so it was kept.'
      : 'Your plan is now the file’s starting plan.',
  );
} catch (error) {
  if (!(error instanceof z.ZodError)) throw error;
  console.error(
    error.issues
      .map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`)
      .join('\n'),
  );
  process.exit(1);
}
