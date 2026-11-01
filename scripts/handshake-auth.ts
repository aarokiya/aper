import { authenticateHandshake } from '@/lib/handshake/auth';
import { runHandshakeSync, withBrowserProfile } from '@/lib/sync/run';

console.log(
  'Opening Handshake. Sign in with your Georgia Tech account (SSO and Duo) in the browser window.',
);
await withBrowserProfile('Handshake sign-in', () => authenticateHandshake());
console.log('Connected to Handshake. Reading campus events…');
const result = await runHandshakeSync();
console.log(JSON.stringify(result, null, 2));
if (result.status === 'FAILED' || result.status === 'AUTH_REQUIRED')
  process.exitCode = 1;
