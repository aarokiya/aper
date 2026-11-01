import fs from 'node:fs';
import path from 'node:path';
import { dataDir, getDb, initializeDatabase } from '@/lib/db/client';
import { sanitizeFilename } from './content';
import { rebuildSearchIndex } from '@/lib/search/index';

type Row = Record<string, unknown>;
const yaml = (value: unknown) => JSON.stringify(value ?? null);
const write = (file: string, value: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`);
};
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function generateCorpus() {
  initializeDatabase();
  const { sqlite } = getDb();
  const root = path.join(dataDir, 'documents');
  const normalized = path.join(dataDir, 'normalized');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(normalized, { recursive: true });
  const courses = sqlite
    .prepare(
      `SELECT * FROM courses ORDER BY is_current DESC,COALESCE(course_code,name)`,
    )
    .all() as Row[];
  const assignments = sqlite
    .prepare(
      `SELECT a.*,c.course_code,c.name AS course_name,s.provider_state,s.submitted_at,s.score,s.grade,s.graded_at,s.comments_json,s.rubric_assessment_json,l.workflow_status,l.notes,l.priority FROM assignments a JOIN courses c ON c.id=a.course_id LEFT JOIN submissions s ON s.assignment_id=a.id LEFT JOIN local_task_metadata l ON l.assignment_id=a.id ORDER BY a.due_at IS NULL,a.due_at`,
    )
    .all() as Row[];
  const announcements = sqlite
    .prepare(
      `SELECT n.*,c.course_code,c.name AS course_name FROM announcements n JOIN courses c ON c.id=n.course_id ORDER BY n.posted_at DESC`,
    )
    .all() as Row[];
  const grades = sqlite
    .prepare(
      `SELECT id,course_code,name,current_score,current_grade,final_score,last_synced_at FROM courses ORDER BY course_code`,
    )
    .all() as Row[];
  write(path.join(normalized, 'courses.json'), pretty(courses));
  write(path.join(normalized, 'assignments.json'), pretty(assignments));
  write(path.join(normalized, 'announcements.json'), pretty(announcements));
  write(path.join(normalized, 'grades.json'), pretty(grades));

  const indexLines = [
    '---',
    `generated_at: ${yaml(new Date().toISOString())}`,
    `course_count: ${courses.length}`,
    `assignment_count: ${assignments.length}`,
    '---',
    '',
    '# _aper Index',
    '',
    '## Current courses',
    '',
  ];
  for (const course of courses.filter((item) => item.is_current)) {
    const courseSlug = sanitizeFilename(
      String(course.local_alias ?? course.course_code ?? course.name),
    ).replace(/\s+/g, '-');
    const courseDir = path.join(root, courseSlug);
    const courseAssignments = assignments.filter(
      (item) => item.course_id === course.id,
    );
    write(
      path.join(courseDir, 'COURSE.md'),
      `---\nprovider: canvas\ncanvas_course_id: ${yaml(course.source_id)}\ncourse_code: ${yaml(course.course_code)}\nlast_synced_at: ${yaml(course.last_synced_at)}\nsource_url: ${yaml(course.source_url)}\n---\n\n# ${course.name}\n\n${course.syllabus_text ? `## Syllabus\n\n${course.syllabus_text}\n` : ''}`,
    );
    write(
      path.join(courseDir, 'SYLLABUS.md'),
      `---\nprovider: canvas\ncanvas_course_id: ${yaml(course.source_id)}\nsource_url: ${yaml(course.syllabus_url)}\nlast_synced_at: ${yaml(course.last_synced_at)}\n---\n\n# Syllabus — ${course.name}\n\n${course.syllabus_text || '_No syllabus text was available at the last sync._'}\n`,
    );
    const courseIndex = [
      `# ${course.course_code ?? course.name}`,
      '',
      `[Open in Canvas](${course.source_url})`,
      '',
      '## Assignments',
      '',
    ];
    for (const assignment of courseAssignments) {
      const filename = `assignment-${assignment.source_id}.md`;
      const local = path.join(courseDir, 'assignments', filename);
      write(local, assignmentMarkdown(assignment));
      courseIndex.push(
        `- [${assignment.title}](assignments/${filename}) — ${assignment.due_at ?? 'no due date'} — ${assignment.provider_state ?? 'UNSUBMITTED'}`,
      );
    }
    const courseAnnouncements = announcements.filter(
      (item) => item.course_id === course.id,
    );
    for (const announcement of courseAnnouncements)
      write(
        path.join(
          courseDir,
          'announcements',
          `announcement-${announcement.source_id}.md`,
        ),
        announcementMarkdown(announcement),
      );
    const modules = sqlite
      .prepare(`SELECT * FROM modules WHERE course_id=? ORDER BY position`)
      .all(course.id) as Row[];
    for (const courseModule of modules) {
      const moduleItems = sqlite
        .prepare(
          `SELECT * FROM module_items WHERE module_id=? ORDER BY position`,
        )
        .all(courseModule.id) as Row[];
      write(
        path.join(courseDir, 'modules', `module-${courseModule.source_id}.md`),
        `---\nprovider: canvas\nmodule_id: ${yaml(courseModule.source_id)}\nsource_url: ${yaml(courseModule.source_url)}\nlast_synced_at: ${yaml(courseModule.last_synced_at)}\n---\n\n# ${courseModule.title}\n\n${moduleItems.map((item) => `- ${item.type ?? 'Item'}: [${item.title}](${item.html_url ?? item.external_url ?? ''})`).join('\n')}\n`,
      );
    }
    const grade = grades.find((item) => item.id === course.id);
    write(
      path.join(courseDir, 'grades', 'CURRENT.md'),
      `# Current grade — ${course.course_code ?? course.name}\n\n- Grade: ${grade?.current_grade ?? 'Not available'}\n- Current score: ${grade?.current_score ?? 'Not available'}\n- Final score: ${grade?.final_score ?? 'Not available'}\n- Last synced: ${course.last_synced_at}\n`,
    );
    write(path.join(courseDir, 'INDEX.md'), `${courseIndex.join('\n')}\n`);
    indexLines.push(
      `- [${course.course_code ?? course.name}](${courseSlug}/INDEX.md) — ${course.name}`,
    );
  }
  indexLines.push('', '## Upcoming assignments', '');
  for (const assignment of assignments
    .filter(
      (item) =>
        item.due_at && new Date(String(item.due_at)).getTime() >= Date.now(),
    )
    .slice(0, 40)) {
    const course = courses.find((item) => item.id === assignment.course_id)!;
    const slug = sanitizeFilename(
      String(course.local_alias ?? course.course_code ?? course.name),
    ).replace(/\s+/g, '-');
    indexLines.push(
      `- ${assignment.due_at} — [${assignment.title}](${slug}/assignments/assignment-${assignment.source_id}.md) — ${assignment.course_code ?? assignment.course_name}`,
    );
  }
  write(path.join(root, 'INDEX.md'), `${indexLines.join('\n')}\n`);
  const search = rebuildSearchIndex();
  return {
    courses: courses.length,
    assignments: assignments.length,
    announcements: announcements.length,
    searchDocuments: search.count,
    root,
  };
}

function assignmentMarkdown(row: Row) {
  return `---\nprovider: canvas\ncourse: ${yaml(row.course_code ?? row.course_name)}\ncanvas_course_id: ${yaml(row.course_id)}\nassignment_id: ${yaml(row.source_id)}\ntitle: ${yaml(row.title)}\ndue_at: ${yaml(row.due_at)}\nsource_due_at: ${yaml(row.due_at_original)}\npoints_possible: ${yaml(row.points_possible)}\nsubmission_status: ${yaml(row.provider_state ?? 'UNSUBMITTED')}\nlocal_workflow_status: ${yaml(row.workflow_status ?? 'NOT_STARTED')}\nscore: ${yaml(row.score)}\nlast_synced_at: ${yaml(row.last_synced_at)}\nsource_url: ${yaml(row.source_url)}\n---\n\n# ${row.title}\n\n## Status\n\n- Provider state: ${row.provider_state ?? 'UNSUBMITTED'}\n- Local workflow: ${row.workflow_status ?? 'NOT_STARTED'}\n- Due: ${row.due_at ?? 'No due date'}\n- Score: ${row.score ?? 'Not graded'}${row.points_possible != null ? ` / ${row.points_possible}` : ''}\n\n## Description\n\n${row.description_text || '_No description was provided._'}\n\n## Submission\n\n${row.submitted_at ? `Submitted ${row.submitted_at}.` : 'No submitted timestamp is available.'}\n\n## Feedback\n\n${row.comments_json && row.comments_json !== 'null' ? `\`\`\`json\n${pretty(JSON.parse(String(row.comments_json)))}\`\`\`` : '_No feedback is available._'}\n\n## Rubric\n\n${row.rubric_assessment_json && row.rubric_assessment_json !== 'null' ? `\`\`\`json\n${pretty(JSON.parse(String(row.rubric_assessment_json)))}\`\`\`` : '_No released rubric assessment is available._'}\n\n## Local notes\n\n${row.notes || '_None._'}\n`;
}

function announcementMarkdown(row: Row) {
  return `---\nprovider: canvas\nannouncement_id: ${yaml(row.source_id)}\ncourse: ${yaml(row.course_code ?? row.course_name)}\nposted_at: ${yaml(row.posted_at)}\nlast_synced_at: ${yaml(row.last_synced_at)}\nsource_url: ${yaml(row.source_url)}\n---\n\n# ${row.title}\n\n${row.message_text || '_No announcement body was available._'}\n`;
}
