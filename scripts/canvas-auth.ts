import { authenticateCanvas } from '@/lib/canvas/auth';
import { runCanvasSync } from '@/lib/sync/run';

console.log('Opening Georgia Tech Canvas. Complete SSO and Duo manually in the browser window.');
const auth = await authenticateCanvas();
console.log(`Connected${auth.accountName ? ` as ${auth.accountName}` : ''}. Starting sync…`);
const result = await runCanvasSync();
console.log(JSON.stringify(result, null, 2));
if (result.status === 'FAILED' || result.status === 'AUTH_REQUIRED') process.exitCode = 1;
