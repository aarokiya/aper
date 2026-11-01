import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dataDir, dbPath, initializeDatabase } from '@/lib/db/client';

initializeDatabase();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backups = path.join(dataDir, 'backups');
fs.mkdirSync(backups, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-backup-'));
fs.copyFileSync(dbPath, path.join(stage, 'academic.db'));
for (const name of ['documents', 'normalized', 'study', 'appearance']) {
  const source = path.join(dataDir, name);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(stage, name), { recursive: true });
}
if (process.env.BACKUP_DOWNLOADS === '1' && fs.existsSync(path.join(dataDir, 'downloads'))) fs.cpSync(path.join(dataDir, 'downloads'), path.join(stage, 'downloads'), { recursive: true });
const target = path.join(backups, `aper-${stamp}.tar.gz`);
const result = spawnSync('tar', ['-czf', target, '-C', stage, '.'], { stdio: 'inherit' });
fs.rmSync(stage, { recursive: true, force: true });
if (result.status !== 0) throw new Error('Backup archive creation failed.');
console.log(target);
