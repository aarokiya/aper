import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { applyProfile, readProfileFile } from '@/lib/profile/apply';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? 'aper.profile.json');

if (!fs.existsSync(file)) {
  console.error(
    `No profile at ${file}. Copy aper.profile.example.json to aper.profile.json and fill it in.`,
  );
  process.exit(1);
}

let profile;
try {
  profile = readProfileFile(file);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(`${path.basename(file)} doesn't match schemas/profile.schema.json:`);
    for (const issue of error.issues)
      console.error(`  ${issue.path.join('.') || '(top level)'}: ${issue.message}`);
  } else console.error(`${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const report = await applyProfile(profile, { baseDir: path.dirname(file), dryRun });
const section = (title: string, lines: string[]) => {
  if (!lines.length) return;
  console.log(title);
  for (const line of lines) console.log(`  ${line}`);
};
console.log(dryRun ? `Dry run of ${path.basename(file)}; nothing was written.` : `Applied ${path.basename(file)}.`);
section('Set:', report.applied);
section('Skipped:', report.skipped);
section('Check:', report.warnings);
if (!report.applied.length && !dryRun) console.log('Nothing changed.');
