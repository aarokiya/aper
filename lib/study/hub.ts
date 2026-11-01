import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataDir } from '@/lib/db/client';
import { seedHubProgress } from './progress';
import { ProgressFileError, readProgressFile } from './progress-file';
import type { StudyCourse, StudyHub } from './types';

/**
 * The Study Hub content lives in the private data directory (it is personal
 * course material). It is imported from a courses JSON file (see
 * docs/study-hub-format.md) or from a standalone Study Hub's HTML export.
 */
export const studyHubPath = path.join(dataDir, 'study', 'hub.json');

const weekSchema = z.looseObject({
  n: z.number(),
  label: z.string(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  title: z.string(),
  secs: z.string().default(''),
  events: z.array(z.tuple([z.string(), z.string()])).default([]),
  note: z.string().default(''),
  lectures: z.array(z.any()).default([]),
  refs: z.array(z.any()).default([]),
  practice: z.array(z.any()).default([]),
  studio: z.array(z.any()).default([]),
  cards: z.array(z.any()).default([]),
  parsons: z.array(z.any()).default([]),
  checks: z.array(z.string()).default([]),
  exams: z.array(z.string()).default([]),
});

/** A course's `grading` block (its Grades view): weighted groups and letter cutoffs. */
const gradingSchema = z
  .object({
    source: z.string().default(''),
    note: z.string().default(''),
    letters: z.record(z.string(), z.number()),
    groups: z
      .array(
        z.object({
          id: z.string().min(1),
          h: z.string(),
          weight: z.number().min(0),
          drop: z.number().int().min(0).default(0),
          note: z.string().default(''),
          items: z.array(
            z.object({
              id: z.string().min(1),
              t: z.string().optional(),
              sec: z.string().optional(),
              due: z
                .string()
                .regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)?$/)
                .optional(),
              exam: z.string().optional(),
              avgLowest: z.array(z.string()).optional(),
            }),
          ),
        }),
      )
      .min(1),
  })
  .refine(
    (grading) => {
      const ids = grading.groups.flatMap((group) =>
        group.items.map((item) => item.id),
      );
      return new Set(ids).size === ids.length;
    },
    { message: 'Grading item ids must be unique (they key saved scores).' },
  );

const courseSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  code: z.string().min(1),
  name: z.string().min(1),
  who: z.string().default(''),
  math: z.boolean().default(false),
  code_lang: z.string().optional(),
  labels: z
    .object({ lecture: z.string(), practice: z.string(), studio: z.string() })
    .default({ lecture: 'Lecture', practice: 'Practice', studio: 'Studio' }),
  book: z
    .tuple([z.string(), z.string().nullable()])
    .default(['Textbook', null]),
  tutor: z.string().default(''),
  weeks: z.array(weekSchema).min(1),
  exams: z.record(z.string(), z.any()).default({}),
  formulas: z.array(z.any()).default([]),
  materials: z.array(z.any()).default([]),
  pages: z.array(z.any()).default([]),
  missing: z.array(z.string()).default([]),
  grading: gradingSchema.optional(),
});

/** The course array a hub imports; docs/study-hub-format.md documents it. */
export const coursesSchema = z.array(courseSchema).min(1);

const hubSchema = z.object({
  title: z.string(),
  importedAt: z.string(),
  source: z.string(),
  courses: coursesSchema,
});

/** Pull `window.COURSES = [...]` and the page title out of a hub's HTML export. */
export function extractArtifactCourses(html: string) {
  const marker = html.indexOf('window.COURSES');
  if (marker < 0)
    throw new Error('No window.COURSES data block was found in this file.');
  const start = html.indexOf('[', marker);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0)
    throw new Error('The window.COURSES data block is incomplete.');
  const literal = html.slice(start, end).trim().replace(/;\s*$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(literal);
  } catch {
    throw new Error('The window.COURSES data block is not valid JSON.');
  }
  const title =
    html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || 'Study Hub';
  return { title, courses: parsed };
}

/**
 * The progress an HTML hub bundles (`window.SEED_PROGRESS = {...}`), parsed;
 * null when the file has none.
 */
export function extractArtifactProgress(html: string): unknown {
  const marker = html.indexOf('window.SEED_PROGRESS');
  if (marker < 0) return null;
  const start = html.indexOf('{', marker);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(html.slice(start, end).trim().replace(/;\s*$/, ''));
  } catch {
    return null;
  }
}

/** An imported hub and the course ids whose progress came from the import. */
export type StudyHubImport = { hub: StudyHub; seeded: string[] };

/**
 * Validate a hub without writing it. Accepts a hub's HTML export, a
 * `{title?, courses}` JSON, or a bare course array, plus optional progress
 * (the HTML's `window.SEED_PROGRESS`, or `progress`, the text of a
 * `progress.json` export). Throws when the content isn't a valid hub.
 */
function parseStudyHub(content: string, source: string, progress?: string) {
  const text = content.trim();
  let title = 'Study Hub';
  let raw: unknown;
  let seed: unknown = null;
  if (text.startsWith('<') || text.includes('window.COURSES')) {
    const extracted = extractArtifactCourses(text);
    title = extracted.title;
    raw = extracted.courses;
    seed = extractArtifactProgress(text);
  } else {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(
        'Upload the Study Hub courses JSON or a hub’s .html export.',
      );
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const object = raw as { title?: unknown; courses?: unknown };
      if (typeof object.title === 'string') title = object.title;
      raw = object.courses;
    }
  }
  if (progress !== undefined) {
    try {
      seed = JSON.parse(progress);
    } catch {
      throw new Error('The progress file is not valid JSON.');
    }
  }
  const courses = coursesSchema.safeParse(raw);
  if (!courses.success)
    throw new Error(
      `The course data does not match the Study Hub format: ${courses.error.issues[0]?.path.join('.') || 'root'} ${courses.error.issues[0]?.message ?? ''}`.trim(),
    );
  const hub: StudyHub = {
    title,
    importedAt: new Date().toISOString(),
    source,
    courses: courses.data as unknown as StudyCourse[],
  };
  return { hub, seed };
}

/**
 * Validate and write a hub (see parseStudyHub for what it accepts). Bundled
 * progress is merged per course: the newer copy wins. Returns the hub and
 * the course ids whose progress came from it.
 */
export function importStudyHub(
  content: string,
  source: string,
  progress?: string,
): StudyHubImport {
  const { hub, seed } = parseStudyHub(content, source, progress);
  fs.mkdirSync(path.dirname(studyHubPath), { recursive: true });
  const temp = `${studyHubPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(hub)}\n`, { mode: 0o600 });
  fs.renameSync(temp, studyHubPath);
  cache = null;
  return { hub, seeded: seed === null ? [] : seedFrom(seed, hub) };
}

/** The `<title>` of a hub page in `folder`, if it has one. */
function folderTitle(folder: string, pages: string[]) {
  for (const page of pages) {
    const file = path.join(folder, page);
    if (!fs.existsSync(file)) continue;
    const title = fs
      .readFileSync(file, 'utf8')
      .match(/<title>([^<]*)<\/title>/i)?.[1]
      ?.trim();
    if (title) return title;
  }
  return undefined;
}

/**
 * What a path imports: a file as is, or a folder's `courses.json` with its
 * `progress.json` (at the top level, or under `src/` in the standalone hub's
 * source layout), falling back to the folder's `index.html` export. A bare
 * course array in a folder takes the title of the folder's hub page.
 * `source` is the imported file relative to the target's parent folder.
 */
function hubSources(target: string): {
  content: string;
  source: string;
  progress?: string;
} {
  if (!fs.existsSync(target)) throw new Error(`${target} does not exist.`);
  const sourceOf = (file: string) =>
    path.relative(path.dirname(path.resolve(target)), path.resolve(file)) ||
    path.basename(file);
  if (!fs.statSync(target).isDirectory())
    return {
      content: fs.readFileSync(target, 'utf8'),
      source: sourceOf(target),
    };
  for (const dir of ['', 'src']) {
    const courses = path.join(target, dir, 'courses.json');
    if (!fs.existsSync(courses)) continue;
    const progress = path.join(target, dir, 'progress.json');
    let content = fs.readFileSync(courses, 'utf8');
    const title = folderTitle(target, ['src/shell.html', 'index.html']);
    if (title && content.trimStart().startsWith('['))
      content = `{"title":${JSON.stringify(title)},"courses":${content}}`;
    return {
      content,
      source: sourceOf(courses),
      progress: fs.existsSync(progress)
        ? fs.readFileSync(progress, 'utf8')
        : undefined,
    };
  }
  const built = path.join(target, 'index.html');
  if (fs.existsSync(built))
    return {
      content: fs.readFileSync(built, 'utf8'),
      source: sourceOf(built),
    };
  throw new Error(
    `${target} has no courses.json (or src/courses.json) and no index.html.`,
  );
}

/**
 * Import a hub from a path: a courses `.json` file, a hub `.html` export, or
 * a folder holding `courses.json` (and optionally `progress.json`). The
 * caller rebuilds the search index.
 */
export function importStudyHubPath(target: string): StudyHubImport {
  const { content, source, progress } = hubSources(target);
  return importStudyHub(content, source, progress);
}

/** What a hub path would import, validated, without writing anything. */
export type StudyHubPreview = {
  title: string;
  courses: Array<{ id: string; code: string; name: string }>;
  /** the same title and courses are already imported */
  current: boolean;
};

/** Validate a hub path the way importStudyHubPath does, writing nothing. */
export function previewStudyHubPath(target: string): StudyHubPreview {
  const { content, source, progress } = hubSources(target);
  const { hub } = parseStudyHub(content, source, progress);
  const saved = loadStudyHub();
  return {
    title: hub.title,
    courses: hub.courses.map(({ id, code, name }) => ({ id, code, name })),
    current:
      saved?.title === hub.title &&
      JSON.stringify(saved.courses) === JSON.stringify(hub.courses),
  };
}

/** Bundled progress that isn't a progress export is ignored, as the hub ignores it. */
function seedFrom(seed: unknown, hub: StudyHub) {
  try {
    return seedHubProgress(
      readProgressFile(
        seed,
        hub.courses.map((course) => course.id),
      ),
    );
  } catch (error) {
    if (error instanceof ProgressFileError) return [];
    throw error;
  }
}

let cache: { mtimeMs: number; hub: StudyHub | null } | null = null;

/** The imported hub, or null when nothing has been imported (cached by mtime). */
export function loadStudyHub(): StudyHub | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(studyHubPath).mtimeMs;
  } catch {
    cache = null;
    return null;
  }
  if (cache?.mtimeMs === mtimeMs) return cache.hub;
  let hub: StudyHub | null = null;
  try {
    const parsed = hubSchema.safeParse(
      JSON.parse(fs.readFileSync(studyHubPath, 'utf8')),
    );
    hub = parsed.success ? (parsed.data as unknown as StudyHub) : null;
  } catch {
    hub = null;
  }
  cache = { mtimeMs, hub };
  return hub;
}

export function getStudyCourse(id: string): StudyCourse | null {
  return loadStudyHub()?.courses.find((course) => course.id === id) ?? null;
}

export function removeStudyHub() {
  fs.rmSync(studyHubPath, { force: true });
  cache = null;
}
