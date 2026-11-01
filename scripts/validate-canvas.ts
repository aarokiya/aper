import fs from 'node:fs';
import path from 'node:path';
import { getDb, initializeDatabase, dataDir } from '@/lib/db/client';

initializeDatabase();
const { sqlite } = getDb();
const latestRun = sqlite.prepare(`SELECT id FROM sync_runs WHERE provider='canvas' AND status IN ('SUCCESS','PARTIAL') ORDER BY id DESC LIMIT 1`).get() as { id: number } | undefined;
const rawRunDir = latestRun ? path.join(dataDir, 'raw', 'canvas', `run-${latestRun.id}`) : null;
const rawAssignmentFiles = rawRunDir && fs.existsSync(rawRunDir) ? fs.readdirSync(rawRunDir, { withFileTypes: true }).filter((item) => item.isDirectory() && item.name.startsWith('course-')).map((item) => path.join(rawRunDir, item.name, 'assignments.json')).filter((file) => fs.existsSync(file)) : [];
const rawAssignments = rawAssignmentFiles.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ id: string | number; due_at?: string | null; points_possible?: number | null }>);
const normalizedAssignments = sqlite.prepare(`SELECT source_id,due_at,points_possible FROM assignments WHERE source_provider='canvas'`).all() as Array<{ source_id: string; due_at: string | null; points_possible: number | null }>;
const normalizedBySource = new Map(normalizedAssignments.map((item) => [item.source_id, item]));
const dueDateMismatches = rawAssignments.filter((item) => normalizedBySource.get(String(item.id))?.due_at !== (item.due_at ?? null)).length;
const pointsMismatches = rawAssignments.filter((item) => normalizedBySource.get(String(item.id))?.points_possible !== (item.points_possible ?? null)).length;
const report = {
  generatedAt: new Date().toISOString(),
  courses: sqlite.prepare(`SELECT source_id AS canvasCourseId,course_code AS courseCode,name,(SELECT count(*) FROM assignments a WHERE a.course_id=c.id) AS assignments,(SELECT count(*) FROM modules m WHERE m.course_id=c.id) AS modules,(SELECT count(*) FROM announcements n WHERE n.course_id=c.id) AS announcements,(SELECT count(*) FROM course_files f WHERE f.course_id=c.id) AS files,current_score AS currentScore,current_grade AS currentGrade,last_synced_at AS lastSyncedAt FROM courses c ORDER BY course_code`).all(),
  sourceComparison: { syncRunId: latestRun?.id ?? null, rawAssignments: rawAssignments.length, normalizedAssignments: normalizedAssignments.length, dueDateMismatches, pointsMismatches },
  invariants: {
    assignmentsWithoutSourceUrl: (sqlite.prepare(`SELECT count(*) AS count FROM assignments WHERE source_url IS NULL`).get() as { count: number }).count,
    scoredWithoutPointsPossible: (sqlite.prepare(`SELECT count(*) AS count FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.score IS NOT NULL AND a.points_possible IS NULL`).get() as { count: number }).count,
    orphanLocalTaskMetadata: (sqlite.prepare(`SELECT count(*) AS count FROM local_task_metadata l LEFT JOIN assignments a ON a.id=l.assignment_id WHERE l.assignment_id IS NOT NULL AND a.id IS NULL`).get() as { count: number }).count,
    interruptedSyncRuns: (sqlite.prepare(`SELECT count(*) AS count FROM sync_runs WHERE status='RUNNING'`).get() as { count: number }).count,
  },
};
const target = path.join(dataDir, 'debug', 'canvas-validation.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.invariants.assignmentsWithoutSourceUrl || report.invariants.orphanLocalTaskMetadata || dueDateMismatches || pointsMismatches) process.exitCode = 1;
