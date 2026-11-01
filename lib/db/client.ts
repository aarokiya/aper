import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const projectRoot = process.cwd();
export const dataDir = process.env.ACADEMIC_DATA_DIR ?? path.join(projectRoot, 'data');
export const dbPath = process.env.ACADEMIC_DB_PATH ?? path.join(dataDir, 'academic.db');

type DbState = { sqlite: Database.Database; db: BetterSQLite3Database<typeof schema> };
const holder = globalThis as typeof globalThis & { __academicDb?: DbState };

export function getDb() {
  if (!holder.__academicDb) {
    fs.mkdirSync(dataDir, { recursive: true });
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    holder.__academicDb = { sqlite, db: drizzle(sqlite, { schema }) };
  }
  return holder.__academicDb;
}

export function initializeDatabase() {
  const state = getDb();
  const migrationsFolder = path.join(projectRoot, 'drizzle');
  if (fs.existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) {
    migrate(state.db, { migrationsFolder });
  }
  state.sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
      entity_type UNINDEXED,
      entity_id UNINDEXED,
      course_id UNINDEXED,
      title,
      body,
      source_url UNINDEXED,
      tokenize = 'porter unicode61'
    );
  `);
  state.sqlite.pragma('optimize');
  return state;
}

export function closeDatabaseForTests() {
  if (holder.__academicDb) {
    holder.__academicDb.sqlite.close();
    delete holder.__academicDb;
  }
}
