import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextResponse } from 'next/server';
import { dataDir } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function POST() {
  const root = process.cwd();
  const stage = fs.mkdtempSync(
    path.join(os.tmpdir(), 'aper-debug-'),
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destinationDir = path.join(dataDir, 'debug');
  fs.mkdirSync(destinationDir, { recursive: true });
  try {
    for (const relative of [
      'package.json',
      'pnpm-lock.yaml',
      'README.md',
      'SECURITY.md',
      'next.config.ts',
      'drizzle',
      'docs/canvas-discovery.md',
      'docs/gradescope-support.md',
    ]) {
      const source = path.join(/*turbopackIgnore: true*/ root, relative);
      if (fs.existsSync(/*turbopackIgnore: true*/ source))
        fs.cpSync(
          source,
          path.join(/*turbopackIgnore: true*/ stage, relative),
          { recursive: true },
        );
    }
    fs.writeFileSync(
      path.join(stage, 'NOTICE.txt'),
      'This bundle excludes browser profiles, cookies, credentials, logs, provider responses, validation output, databases, generated academic documents, Handshake event data, and downloaded files.\n',
    );
    const target = path.join(destinationDir, `debug-bundle-${stamp}.tar.gz`);
    const result = spawnSync('tar', ['-czf', target, '-C', stage, '.']);
    if (result.status !== 0) throw new Error('Could not create debug bundle.');
    return NextResponse.json({ ok: true, path: target });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
