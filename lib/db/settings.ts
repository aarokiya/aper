import type { z } from 'zod';
import { getDb, initializeDatabase } from './client';

/**
 * JSON values in the generic `settings` key-value table. Reads validate with
 * a zod schema and fall back to the schema's parse of `{}`/default on any
 * missing or corrupt value, so a bad row can never break a page.
 */
export function readSetting<S extends z.ZodType>(
  key: string,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  initializeDatabase();
  const row = getDb()
    .sqlite.prepare(`SELECT value FROM settings WHERE key=?`)
    .get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: unknown) {
  initializeDatabase();
  getDb()
    .sqlite.prepare(
      `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString());
}

export function deleteSetting(key: string) {
  initializeDatabase();
  getDb().sqlite.prepare(`DELETE FROM settings WHERE key=?`).run(key);
}
