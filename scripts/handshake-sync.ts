import { runHandshakeSync } from '@/lib/sync/run';

const result = await runHandshakeSync();
console.log(JSON.stringify(result, null, 2));
if (result.status === 'AUTH_REQUIRED')
  console.error('Handshake needs sign-in. Run `pnpm handshake:login`.');
if (result.status === 'FAILED' || result.status === 'AUTH_REQUIRED')
  process.exitCode = 1;
