import fs from 'node:fs';
import path from 'node:path';

/**
 * Line-preserving edits to the project's `.env`: other entries, comments,
 * and blank lines stay where they are. Callers that change a variable the
 * running process reads also set `process.env` themselves.
 */
export const envPath = () => path.join(process.cwd(), '.env');

export function readEnvLines() {
  try {
    return fs.readFileSync(envPath(), 'utf8').split('\n');
  } catch {
    return [];
  }
}

export function writeEnvLines(lines: string[]) {
  const file = envPath();
  const body = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  // 0600: the file can hold credentials, and this app is single-user by design.
  fs.writeFileSync(file, body, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort: some filesystems refuse chmod.
  }
}

/** The file's value for `variable`, or null when it has no entry. */
export function readEnvValue(variable: string) {
  const line = readEnvLines().find((entry) =>
    entry.startsWith(`${variable}=`),
  );
  return line === undefined ? null : line.slice(variable.length + 1);
}

/**
 * Sets `variable=value`, replacing an existing entry in place or appending
 * one (under `comment` when given) at the end.
 */
export function setEnvValue(
  variable: string,
  value: string,
  comment?: string,
) {
  const lines = readEnvLines();
  const index = lines.findIndex((line) => line.startsWith(`${variable}=`));
  const entry = `${variable}=${value}`;
  if (index >= 0) lines[index] = entry;
  else {
    while (lines.length && !lines.at(-1)?.trim()) lines.pop();
    if (comment && lines.at(-1) !== comment) {
      if (lines.length) lines.push('');
      lines.push(comment);
    }
    lines.push(entry);
  }
  writeEnvLines(lines);
}

/** Removes every `variable=` entry; leaves a missing file alone. */
export function removeEnvValue(variable: string) {
  const lines = readEnvLines().filter(
    (line) => !line.startsWith(`${variable}=`),
  );
  if (lines.length) writeEnvLines(lines);
}
