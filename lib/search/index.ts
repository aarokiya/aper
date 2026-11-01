import { getDb, initializeDatabase } from '@/lib/db/client';
import { loadStudyHub } from '@/lib/study/hub';
import { stripHtml } from '@/lib/study/model';
import { canvasCourseFor, currentClasses } from '@/lib/study/nav';

type SearchResult = { entityType: string; entityId: number; courseId: number | null; title: string; snippet: string; sourceUrl: string | null; rank: number };

export function rebuildSearchIndex() {
  initializeDatabase();
  const { sqlite } = getDb();
  // Read outside the transaction: currentClasses() re-enters initializeDatabase().
  const classes = currentClasses();
  const hub = loadStudyHub();
  const transaction = sqlite.transaction(() => {
    sqlite.exec('DELETE FROM search_documents');
    const insert = sqlite.prepare(`INSERT INTO search_documents (entity_type,entity_id,course_id,title,body,source_url) VALUES (?,?,?,?,?,?)`);
    for (const row of sqlite.prepare(`SELECT id,name AS title,course_code || ' ' || COALESCE(syllabus_text,'') AS body,source_url FROM courses`).all() as Array<Record<string, unknown>>) insert.run('course', row.id, row.id, row.title, row.body ?? '', row.source_url);
    for (const row of sqlite.prepare(`SELECT a.id,a.course_id,a.title,COALESCE(a.description_text,'') || ' ' || COALESCE(l.notes,'') AS body,a.source_url FROM assignments a LEFT JOIN local_task_metadata l ON l.assignment_id=a.id`).all() as Array<Record<string, unknown>>) insert.run('assignment', row.id, row.course_id, row.title, row.body ?? '', row.source_url);
    for (const row of sqlite.prepare(`SELECT id,course_id,title,COALESCE(message_text,'') AS body,source_url FROM announcements`).all() as Array<Record<string, unknown>>) insert.run('announcement', row.id, row.course_id, row.title, row.body ?? '', row.source_url);
    for (const row of sqlite.prepare(`SELECT id,course_id,title,COALESCE(body_text,'') AS body,source_url FROM pages`).all() as Array<Record<string, unknown>>) insert.run('page', row.id, row.course_id, row.title, row.body ?? '', row.source_url);
    for (const row of sqlite.prepare(`SELECT mi.id,m.course_id,mi.title,m.title || ' ' || mi.type || ' ' || COALESCE(CASE WHEN json_valid(mi.content_details_json) THEN json_extract(mi.content_details_json,'$.display_name') END,'') AS body,COALESCE(mi.html_url,mi.external_url) AS source_url FROM module_items mi JOIN modules m ON m.id=mi.module_id`).all() as Array<Record<string, unknown>>) insert.run('module_item', row.id, row.course_id, row.title, row.body ?? '', row.source_url);
    for (const row of sqlite.prepare(`SELECT id,course_id,display_name AS title,filename || ' ' || COALESCE(content_type,'') AS body,source_url FROM course_files`).all() as Array<Record<string, unknown>>) insert.run('file', row.id, row.course_id, row.title, row.body ?? '', row.source_url);
    // Study Hub weeks and guides, linked to their in-app pages. Entity ids are
    // course-index * 1000 + week/guide index so they stay unique per type.
    hub?.courses.forEach((course, courseIndex) => {
      const canvasId = canvasCourseFor(course.code, classes);
      for (const week of course.weeks) {
        const body = [
          week.secs,
          ...week.lectures.flatMap((lecture) => [lecture.title, ...lecture.parts.map((part) => `${part.h} ${stripHtml(part.b)}`)]),
          ...week.practice.map((item) => stripHtml(item.q)),
          ...week.studio.map((item) => stripHtml(item.q)),
        ].join(' ');
        insert.run('study', courseIndex * 1000 + week.n, canvasId, `${course.code} week ${week.label}: ${week.title}`, body, `/study/${course.id}/week/${week.n}`);
      }
      course.pages.forEach((page, pageIndex) => {
        insert.run('study_guide', courseIndex * 1000 + pageIndex, canvasId, `${course.code}: ${page.title}`, `${page.lead} ${stripHtml(page.html)}`, `/study/${course.id}/guides/${page.id}`);
      });
    });
  });
  transaction();
  sqlite.pragma('optimize');
  return sqlite.prepare('SELECT count(*) AS count FROM search_documents').get() as { count: number };
}

export function searchLocal(query: string, limit = 40): SearchResult[] {
  initializeDatabase();
  const clean = query.trim().replace(/["'*:^{}()[\]]/g, ' ');
  if (!clean) return [];
  const expression = clean.split(/\s+/).filter(Boolean).map((term) => `"${term.replace(/"/g, '""')}"*`).join(' AND ');
  return getDb().sqlite.prepare(`SELECT entity_type AS entityType,CAST(entity_id AS INTEGER) AS entityId,CAST(course_id AS INTEGER) AS courseId,title,snippet(search_documents,4,'<mark>','</mark>',' … ',18) AS snippet,source_url AS sourceUrl,bm25(search_documents) AS rank FROM search_documents WHERE search_documents MATCH ? ORDER BY rank LIMIT ?`).all(expression, Math.min(Math.max(limit, 1), 100)) as SearchResult[];
}
