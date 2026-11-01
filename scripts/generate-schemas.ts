import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { appearanceSchema } from '@/lib/appearance/schema';
import { plannerFileSchema } from '@/lib/planner/types';
import { profileSchema } from '@/lib/profile/schema';
import { coursesSchema } from '@/lib/study/hub';
import { studyPrefsSchema } from '@/lib/study/prefs-schema';

// JSON Schemas for the files a student's agent writes, generated from the
// zod schemas the app validates them with. Rerun after changing those.
const outDir = path.join(process.cwd(), 'schemas');
const BASE = 'https://github.com/aarokiya/aper/blob/main/schemas/';

const inputSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;

function profileJsonSchema() {
  const profile = inputSchema(profileSchema);
  const properties = profile.properties as Record<string, Record<string, unknown>>;
  // These sections are validated against their stores' schemas and merged, so
  // publish those (every field optional) instead of an open object.
  for (const [key, schema, description] of [
    ['appearance', appearanceSchema, 'Any subset of the appearance settings; merged onto what is saved.'],
    ['study', studyPrefsSchema, 'Any subset of the study preferences; merged onto what is saved.'],
  ] as const) {
    const { $schema: _, ...rest } = inputSchema(schema);
    properties[key] = { ...rest, description };
  }
  return profile;
}

const files: Record<string, Record<string, unknown>> = {
  'profile.schema.json': profileJsonSchema(),
  'planner-file.schema.json': inputSchema(plannerFileSchema),
  'study-hub-courses.schema.json': inputSchema(coursesSchema),
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, schema] of Object.entries(files)) {
  const body = { $id: `${BASE}${name}`, ...schema };
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`Wrote schemas/${name}`);
}
