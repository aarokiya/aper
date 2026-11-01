import { authenticateGradescope } from '@/lib/gradescope/auth';
import { runGradescopeSync } from '@/lib/sync/run';

console.log(
  'Opening Gradescope. Complete login, SSO, Duo, or CAPTCHA manually in the browser window.',
);
await authenticateGradescope();
console.log('Connected to Gradescope. Starting sync…');
const result = await runGradescopeSync();
console.log(JSON.stringify(result, null, 2));
if (result.status === 'FAILED' || result.status === 'AUTH_REQUIRED')
  process.exitCode = 1;
