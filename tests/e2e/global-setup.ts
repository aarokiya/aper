import fs from 'node:fs';
import path from 'node:path';

export async function seedE2eDatabase() {
  const root = process.cwd();
  const dbPath = path.join(root, 'data', 'e2e.db');
  const dataDir = path.join(root, 'data', 'e2e');
  for (const candidate of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`])
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.env.ACADEMIC_DB_PATH = dbPath;
  process.env.ACADEMIC_DATA_DIR = dataDir;
  const { initializeDatabase, getDb, closeDatabaseForTests } =
    await import('@/lib/db/client');
  initializeDatabase();
  const { sqlite } = getDb();
  const at = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO providers (key,display_name,auth_status,last_attempt_at,last_success_at,last_error) VALUES ('canvas','Georgia Tech Canvas','CONNECTED',?,?,?)`,
    )
    .run(
      at,
      at,
      'Most recent scheduled sync was offline; cached data retained.',
    );
  // A signed-out Handshake must never block or fail the academic "Sync now".
  sqlite
    .prepare(
      `INSERT INTO providers (key,display_name,auth_status,last_attempt_at,last_error) VALUES ('handshake','Handshake','AUTHENTICATION_REQUIRED',?,'Sign in to Handshake with your Georgia Tech account.')`,
    )
    .run(at);
  const course = sqlite
    .prepare(
      `INSERT INTO courses (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,name,course_code,current_score,current_grade,is_current) VALUES ('canvas','course-e2e','https://gatech.instructure.com/courses/1',?,?,?,'Computer Organization & Programming','CS 2110',91.4,'A',1) RETURNING id`,
    )
    .get(at, at, at) as { id: number };
  const secondCourse = sqlite
    .prepare(
      `INSERT INTO courses (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,name,course_code,current_score,current_grade,is_current) VALUES ('canvas','course-e2e-two','https://gatech.instructure.com/courses/2',?,?,?,'Design and Analysis of Algorithms','CS 3510',88.2,'B',1) RETURNING id`,
    )
    .get(at, at, at) as { id: number };
  const assignment = sqlite
    .prepare(
      `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,description_html,sanitized_html,description_text,points_possible,due_at,due_at_original,assignment_type) VALUES ('canvas','assignment-e2e','https://gatech.instructure.com/courses/1/assignments/1',?,?,?,?,'Homework: malloc and pointers','<h2>Requirements</h2><p>Use malloc safely.</p>','<h2>Requirements</h2><p>Use malloc safely.</p>','Use malloc safely.',40,?,?,'ASSIGNMENT') RETURNING id`,
    )
    .get(
      at,
      at,
      at,
      course.id,
      new Date(Date.now() + 3_600_000).toISOString(),
      new Date(Date.now() + 3_600_000).toISOString(),
    ) as { id: number };
  sqlite
    .prepare(
      `INSERT INTO submissions (assignment_id,provider_state,late,missing,excused,last_synced_at) VALUES (?,'UNSUBMITTED',0,0,0,?)`,
    )
    .run(assignment.id, at);
  sqlite
    .prepare(
      `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'NOT_STARTED','Review allocator edge cases',2,?,?)`,
    )
    .run(assignment.id, at, at);
  const gradedAssignment = sqlite
    .prepare(
      `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,description_text,points_possible,due_at,due_at_original,assignment_type) VALUES ('canvas','graded-e2e','https://gatech.instructure.com/courses/1/assignments/graded',?,?,?,?,'Graded pointer quiz','Released score fixture.',20,?,?,'QUIZ') RETURNING id`,
    )
    .get(
      at,
      at,
      at,
      course.id,
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date(Date.now() - 86_400_000).toISOString(),
    ) as { id: number };
  sqlite
    .prepare(
      `INSERT INTO submissions (assignment_id,provider_state,score,grade,graded_at,late,missing,excused,last_synced_at) VALUES (?,'GRADED',18.5,'18.5',?,0,0,0,?)`,
    )
    .run(gradedAssignment.id, at, at);
  sqlite
    .prepare(
      `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'GRADED','',0,?,?)`,
    )
    .run(gradedAssignment.id, at, at);
  const upcoming = sqlite
    .prepare(
      `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,description_text,points_possible,due_at,due_at_original,assignment_type) VALUES ('canvas','upcoming-e2e','https://gatech.instructure.com/courses/1/assignments/2',?,?,?,?,'Upcoming project checkpoint','Plan the next milestone.',10,?,?,'PROJECT') RETURNING id`,
    )
    .get(
      at,
      at,
      at,
      course.id,
      new Date(Date.now() + 5 * 86_400_000).toISOString(),
      new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ) as { id: number };
  sqlite
    .prepare(
      `INSERT INTO submissions (assignment_id,provider_state,late,missing,excused,last_synced_at) VALUES (?,'UNSUBMITTED',0,0,0,?)`,
    )
    .run(upcoming.id, at);
  sqlite
    .prepare(
      `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'NOT_STARTED','',0,?,?)`,
    )
    .run(upcoming.id, at, at);
  const secondCourseAssignment = sqlite
    .prepare(
      `INSERT INTO assignments (source_provider,source_id,source_url,first_seen_at,last_seen_at,last_synced_at,course_id,title,description_text,points_possible,due_at,due_at_original,assignment_type) VALUES ('canvas','second-course-e2e','https://gatech.instructure.com/courses/2/assignments/1',?,?,?,?,'Data structures worksheet','Compare trees and heaps.',15,?,?,'ASSIGNMENT') RETURNING id`,
    )
    .get(
      at,
      at,
      at,
      secondCourse.id,
      new Date(Date.now() + 2 * 3_600_000).toISOString(),
      new Date(Date.now() + 2 * 3_600_000).toISOString(),
    ) as { id: number };
  sqlite
    .prepare(
      `INSERT INTO submissions (assignment_id,provider_state,late,missing,excused,last_synced_at) VALUES (?,'UNSUBMITTED',0,0,0,?)`,
    )
    .run(secondCourseAssignment.id, at);
  sqlite
    .prepare(
      `INSERT INTO local_task_metadata (assignment_id,workflow_status,notes,priority,created_at,updated_at) VALUES (?,'NOT_STARTED','',0,?,?)`,
    )
    .run(secondCourseAssignment.id, at, at);
  sqlite
    .prepare(
      `INSERT INTO sync_runs (provider,started_at,finished_at,status,entities_seen,entities_updated,errors_json,warnings_json,timings_json) VALUES ('canvas',?,?,'FAILED',0,0,'["offline"]','[]','{}')`,
    )
    .run(at, at);
  const { generateCorpus } = await import('@/lib/export/corpus');
  generateCorpus();
  closeDatabaseForTests();
}

await seedE2eDatabase();
