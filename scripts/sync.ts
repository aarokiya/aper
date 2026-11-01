import { runAcademicSync } from '@/lib/sync/run';
const results = await runAcademicSync();
console.log(JSON.stringify(results, null, 2));
if (
  results.some(
    (result) => result.status === 'FAILED' || result.status === 'AUTH_REQUIRED',
  )
)
  process.exitCode = 1;
