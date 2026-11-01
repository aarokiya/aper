import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const sandbox = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aper-test-'),
);
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');

let dbModule: typeof import('@/lib/db/client');
let corpusModule: typeof import('@/lib/export/corpus');
let searchModule: typeof import('@/lib/search/index');
let queryModule: typeof import('@/lib/db/queries');

describe('database, corpus, search, and resync invariants', () => {
  beforeAll(async () => {
    dbModule = await import('@/lib/db/client');
    corpusModule = await import('@/lib/export/corpus');
    searchModule = await import('@/lib/search/index');
    queryModule = await import('@/lib/db/queries');
    const { sqlite } = dbModule.initializeDatabase();
    const at = '2026-08-31T12:00:00.000Z';
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const course = sqlite
      .prepare(
        `INSERT INTO courses (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,name,course_code,is_current) VALUES ('canvas','fixture-course','https://gatech.instructure.com/courses/1',?,?,?, 'CS 2110','CS 2110',1) RETURNING id`,
      )
      .get(at, at, at) as { id: number };
    const assignment = sqlite
      .prepare(
        `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,description_text,points_possible,due_at,due_at_original) VALUES ('canvas','fixture-assignment','https://gatech.instructure.com/courses/1/assignments/1',?,?,?,?,'Pointers and malloc','Implement malloc safely',25,?,?) RETURNING id`,
      )
      .get(at, at, at, course.id, dueAt, dueAt) as { id: number };
    sqlite
      .prepare(
        `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'IN_PROGRESS','Remember edge cases',3,?,?)`,
      )
      .run(assignment.id, at, at);
    sqlite
      .prepare(
        `INSERT INTO timer_sessions (local_task_id,started_at,ended_at,duration_seconds) SELECT id,?, ?,900 FROM local_task_metadata WHERE assignment_id=?`,
      )
      .run(at, at, assignment.id);
  });
  afterAll(() => {
    dbModule.closeDatabaseForTests();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  it('initializes all relational tables and FTS5', () => {
    const tables = dbModule
      .getDb()
      .sqlite.prepare(
        `SELECT name FROM sqlite_schema WHERE type IN ('table','view')`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.some((item) => item.name === 'assignments')).toBe(true);
    expect(tables.some((item) => item.name === 'search_documents')).toBe(true);
  });
  it('generates deterministic Markdown and pretty JSON', () => {
    const result = corpusModule.generateCorpus();
    expect(result.assignments).toBe(1);
    const index = fs.readFileSync(
      path.join(sandbox, 'documents', 'INDEX.md'),
      'utf8',
    );
    expect(index).toContain('Pointers and malloc');
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(sandbox, 'normalized', 'assignments.json'),
          'utf8',
        ),
      ),
    ).toHaveLength(1);
  });
  it('finds assignment content and local notes with FTS5', () => {
    corpusModule.generateCorpus();
    expect(searchModule.searchLocal('malloc')[0]?.title).toBe(
      'Pointers and malloc',
    );
    expect(searchModule.searchLocal('edge cases')[0]?.title).toBe(
      'Pointers and malloc',
    );
  });
  it('preserves local metadata and timers across provider upsert', () => {
    const { sqlite } = dbModule.getDb();
    sqlite
      .prepare(
        `UPDATE assignments SET title='Pointers and malloc — updated',last_synced_at=? WHERE source_provider='canvas' AND source_id='fixture-assignment'`,
      )
      .run('2026-08-31T13:00:00Z');
    const row = sqlite
      .prepare(
        `SELECT l.notes,l.priority,l.workflow_status,(SELECT SUM(duration_seconds) FROM timer_sessions t WHERE t.local_task_id=l.id) AS duration FROM local_task_metadata l JOIN assignments a ON a.id=l.assignment_id WHERE a.source_id='fixture-assignment'`,
      )
      .get() as Record<string, unknown>;
    expect(row).toMatchObject({
      notes: 'Remember edge cases',
      priority: 3,
      workflow_status: 'IN_PROGRESS',
      duration: 900,
    });
  });
  it('deduplicates linked and title-time-equivalent planner events', () => {
    const { sqlite } = dbModule.getDb();
    const assignment = sqlite
      .prepare(
        `SELECT id,course_id AS courseId,title,due_at AS dueAt FROM assignments WHERE source_id='fixture-assignment'`,
      )
      .get() as { id: number; courseId: number; title: string; dueAt: string };
    const at = '2026-08-31T12:00:00.000Z';
    const insert = sqlite.prepare(
      `INSERT INTO calendar_events (source_provider,source_id,first_seen_at,last_seen_at,last_synced_at,course_id,assignment_id,title,start_at,event_type) VALUES ('canvas',?,?,?,?,?,?,?,?,?)`,
    );
    insert.run(
      'linked-event',
      at,
      at,
      at,
      assignment.courseId,
      assignment.id,
      assignment.title,
      assignment.dueAt,
      'ASSIGNMENT',
    );
    insert.run(
      'duplicate-planner',
      at,
      at,
      at,
      assignment.courseId,
      null,
      assignment.title,
      assignment.dueAt,
      'PLANNER',
    );
    insert.run(
      'distinct-event',
      at,
      at,
      at,
      assignment.courseId,
      null,
      'Exam review',
      assignment.dueAt,
      'CALENDAR_EVENT',
    );
    const items = queryModule.getCalendarItems();
    expect(
      items.filter((item) => item.title === assignment.title),
    ).toHaveLength(1);
    expect(items.some((item) => item.title === 'Exam review')).toBe(true);
  });
  it('does not erase cached rows when a simulated sync fails', () => {
    const before = (
      dbModule
        .getDb()
        .sqlite.prepare(`SELECT count(*) AS count FROM assignments`)
        .get() as { count: number }
    ).count;
    dbModule
      .getDb()
      .sqlite.prepare(
        `INSERT INTO sync_runs (provider,started_at,finished_at,status,errors_json,warnings_json,timings_json) VALUES ('canvas',?,?,'FAILED','["offline"]','[]','{}')`,
      )
      .run('2026-08-31T14:00:00Z', '2026-08-31T14:00:01Z');
    expect(
      (
        dbModule
          .getDb()
          .sqlite.prepare(`SELECT count(*) AS count FROM assignments`)
          .get() as { count: number }
      ).count,
    ).toBe(before);
  });
});
