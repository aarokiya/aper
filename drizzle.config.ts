import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.ACADEMIC_DB_PATH ?? './data/academic.db' },
});
