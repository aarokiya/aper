import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as DbClient from '@/lib/db/client';
import type * as Apply from '@/lib/profile/apply';
import type * as Schema from '@/lib/profile/schema';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-profile-'));
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');
const at = '2026-09-01T12:00:00.000Z';
const cwd = process.cwd();

let db: typeof DbClient;
let apply: typeof Apply;
let schema: typeof Schema;
let courseId = 0;

const settings = () => {
  const rows = db.getDb().sqlite.prepare(`SELECT key,value FROM settings ORDER BY key`).all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

describe('profile apply', () => {
  beforeAll(async () => {
    // Imported after the env vars above: the client resolves the database path at module load.
    db = await import('@/lib/db/client');
    apply = await import('@/lib/profile/apply');
    schema = await import('@/lib/profile/schema');
    const { sqlite } = db.initializeDatabase();
    // .env writes go to the working directory; keep them in the sandbox.
    process.chdir(sandbox);
    const insert = (sql: string, ...params: unknown[]) => {
      const row = sqlite.prepare(`${sql} RETURNING id`).get(...params) as { id: number }; // RETURNING id always yields this row
      return row.id;
    };
    courseId = insert(
      `INSERT INTO courses (source_provider,source_id,first_seen_at,last_seen_at,last_synced_at,name,course_code,term_name,is_current,provider_json) VALUES ('canvas','c1',?,?,?,?,?,?,1,'{"apply_assignment_group_weights":true}')`,
      at,
      at,
      at,
      'Principles of Economics - ECON-2100-B',
      'ECON-2100-B',
      'Spring 2027',
    );
    for (const [name, title] of [
      ['Homework', 'Homework 1'],
      ['Quizzes', 'Quiz 1'],
      ['Midterm Exams', 'Midterm 1'],
      ['Final Exam', 'Final Exam'],
    ]) {
      const group = insert(
        `INSERT INTO assignment_groups (course_id,source_id,name,position,group_weight,rules_json) VALUES (?,?,?,1,25,'{}')`,
        courseId,
        `g-${name}`,
        name,
      );
      insert(
        `INSERT INTO assignments (source_provider,source_id,first_seen_at,last_seen_at,last_synced_at,course_id,assignment_group_id,title,points_possible,provider_json) VALUES ('canvas',?,?,?,?,?,?,?,100,'{}')`,
        `a-${title}`,
        at,
        at,
        at,
        courseId,
        group,
        title,
      );
    }
    // Appearance settings the profile doesn't mention must survive.
    sqlite
      .prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('appearance',?,?)`)
      .run(JSON.stringify({ greeting: { clock: '24h' }, textScale: 1.1 }), at);
  });

  afterAll(() => {
    process.chdir(cwd);
    db.closeDatabaseForTests();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const profile = () =>
    schema.profileSchema.parse({
      student: { name: 'Jordan Lee', major: 'BS Economics', timeZone: 'America/Chicago' },
      appearance: { theme: 'dark' },
      careers: { interests: ['consulting'] },
      courses: [
        {
          code: 'ECON 2100',
          alias: 'Econ',
          credits: 3,
          syllabus: 'Course grade\nHomework 20%\nQuizzes 15%\nMidterm Exams 40%\nFinal Exam 25%',
        },
        { code: 'ABC 1234', credits: 4 },
      ],
    });

  it('rejects unknown sections and invalid store values', () => {
    expect(schema.profileSchema.safeParse({ cources: [] }).success).toBe(false);
    expect(schema.profileSchema.safeParse({ appearance: { theme: 'neon' } }).success).toBe(false);
  });

  it('writes nothing on a dry run', async () => {
    const before = settings();
    const report = await apply.applyProfile(profile(), { baseDir: sandbox, dryRun: true });
    expect(report.applied.length).toBeGreaterThan(0);
    expect(settings()).toEqual(before);
    expect(fs.existsSync(path.join(sandbox, '.env'))).toBe(false);
  });

  it('merges each section, matches courses by code, and reports what it skipped', async () => {
    const report = await apply.applyProfile(profile(), { baseDir: sandbox });
    const stored = settings();

    const appearance = JSON.parse(stored.appearance);
    expect(appearance.theme).toBe('dark');
    expect(appearance.greeting).toMatchObject({ name: 'Jordan', clock: '24h' });
    expect(appearance.textScale).toBe(1.1);

    expect(JSON.parse(stored['handshake-profile'])).toEqual({ interests: ['consulting'], excludes: [] });
    expect(JSON.parse(stored['student-profile'])).toMatchObject({ major: 'BS Economics' });

    // "ECON 2100" in the profile is Canvas's ECON-2100-B.
    const row = db.getDb().sqlite.prepare(`SELECT local_alias AS alias FROM courses WHERE id=?`).get(courseId) as {
      alias: string | null;
    };
    expect(row.alias).toBe('Econ');
    expect(JSON.parse(stored['grade-calculator']).credits).toEqual({ [courseId]: 3 });
    const policy = JSON.parse(stored[`grade-policy:${courseId}`]);
    expect(policy.components.map((part: { weight: number }) => part.weight)).toEqual([20, 15, 40, 25]);

    expect(report.skipped.some((line) => line.startsWith('ABC 1234:'))).toBe(true);
    expect(fs.readFileSync(path.join(sandbox, '.env'), 'utf8')).toContain('APER_TIME_ZONE=America/Chicago');
  });

  it('changes nothing when applied again', async () => {
    const before = settings();
    const report = await apply.applyProfile(profile(), { baseDir: sandbox });
    expect(report.applied).toEqual([]);
    expect(settings()).toEqual(before);
  });

  it('keeps grading rules the student edited when the same syllabus is applied again', async () => {
    const key = `grade-policy:${courseId}`;
    const edited = JSON.parse(settings()[key]);
    edited.components[0].dropLowest = 2;
    db.getDb().sqlite.prepare(`UPDATE settings SET value=? WHERE key=?`).run(JSON.stringify(edited), key);
    await apply.applyProfile(profile(), { baseDir: sandbox });
    expect(JSON.parse(settings()[key]).components[0].dropLowest).toBe(2);
  });
});
