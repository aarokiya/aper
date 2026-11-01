import { getDb, initializeDatabase } from '@/lib/db/client';
import { canvasCourseTitle, displayCode } from '@/lib/study/nav';
import type {
  FileClass,
  FileClassGroup,
  FileEntry,
  FileIndex,
  FileKind,
  FileModuleGroup,
} from './types';

type CourseRow = {
  id: number;
  url: string | null;
  name: string;
  code: string | null;
  alias: string | null;
  term: string | null;
  isCurrent: number;
};

type CourseFileRow = {
  id: number;
  fileId: string;
  courseId: number;
  displayName: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  sourceUrl: string | null;
  localPath: string | null;
  updatedAt: string | null;
};

type ModuleFileRow = {
  moduleId: number;
  moduleSourceId: string;
  moduleTitle: string;
  modulePosition: number | null;
  moduleUrl: string | null;
  courseId: number;
  fileId: string;
  title: string;
  itemPosition: number | null;
  htmlUrl: string | null;
  details: string | null;
};

type ContentDetails = {
  display_name?: string;
  locked_for_user?: boolean;
  lock_info?: { unlock_at?: string };
};

const TYPE_BY_EXTENSION: Record<string, [label: string, kind: FileKind]> = {
  pdf: ['PDF', 'pdf'],
  ppt: ['Slides', 'slides'],
  pptx: ['Slides', 'slides'],
  key: ['Slides', 'slides'],
  odp: ['Slides', 'slides'],
  doc: ['Document', 'docs'],
  docx: ['Document', 'docs'],
  odt: ['Document', 'docs'],
  rtf: ['Document', 'docs'],
  pages: ['Document', 'docs'],
  txt: ['Text', 'docs'],
  md: ['Text', 'docs'],
  xls: ['Spreadsheet', 'docs'],
  xlsx: ['Spreadsheet', 'docs'],
  csv: ['Spreadsheet', 'docs'],
  numbers: ['Spreadsheet', 'docs'],
  ods: ['Spreadsheet', 'docs'],
  png: ['Image', 'other'],
  jpg: ['Image', 'other'],
  jpeg: ['Image', 'other'],
  gif: ['Image', 'other'],
  webp: ['Image', 'other'],
  heic: ['Image', 'other'],
  svg: ['Image', 'other'],
  mp4: ['Video', 'other'],
  mov: ['Video', 'other'],
  m4v: ['Video', 'other'],
  webm: ['Video', 'other'],
  mp3: ['Audio', 'other'],
  m4a: ['Audio', 'other'],
  wav: ['Audio', 'other'],
  zip: ['Archive', 'other'],
  gz: ['Archive', 'other'],
  tar: ['Archive', 'other'],
  '7z': ['Archive', 'other'],
  java: ['Code', 'other'],
  py: ['Code', 'other'],
  c: ['Code', 'other'],
  cpp: ['Code', 'other'],
  h: ['Code', 'other'],
  js: ['Code', 'other'],
  ts: ['Code', 'other'],
  html: ['Code', 'other'],
  ipynb: ['Code', 'other'],
  jar: ['Code', 'other'],
};

const TYPE_BY_CONTENT_TYPE: Array<[RegExp, label: string, kind: FileKind]> = [
  [/pdf/, 'PDF', 'pdf'],
  [/presentation|powerpoint/, 'Slides', 'slides'],
  [/spreadsheet|excel|csv/, 'Spreadsheet', 'docs'],
  [/wordprocessing|msword|rtf/, 'Document', 'docs'],
  [/^text\//, 'Text', 'docs'],
  [/^image\//, 'Image', 'other'],
  [/^video\//, 'Video', 'other'],
  [/^audio\//, 'Audio', 'other'],
  [/zip|compressed|tar/, 'Archive', 'other'],
];

const GROUP_ORDER: Record<FileClassGroup, number> = {
  current: 0,
  organization: 1,
  past: 2,
};

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const byTitle = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function fileType(
  names: Array<string | null>,
  contentType: string | null,
): [string, FileKind] {
  for (const name of names) {
    const extension = name?.toLowerCase().match(/\.([a-z0-9]{1,7})$/)?.[1];
    if (extension && TYPE_BY_EXTENSION[extension])
      return TYPE_BY_EXTENSION[extension];
  }
  const type = contentType?.toLowerCase() ?? '';
  const match = TYPE_BY_CONTENT_TYPE.find(([pattern]) => pattern.test(type));
  return match ? [match[1], match[2]] : ['File', 'other'];
}

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

function formatDay(iso: string | null) {
  const time = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(time) ? null : shortDate.format(time);
}

function parseDetails(value: string | null): ContentDetails {
  if (!value) return {};
  try {
    return JSON.parse(value) as ContentDetails;
  } catch {
    return {};
  }
}

function classOf(
  course: CourseRow,
): Pick<FileClass, 'code' | 'name' | 'group'> {
  if ((course.term ?? '') === 'Default Term') {
    const name = course.name.trim();
    const code = course.alias ?? name;
    return { code, name: code === name ? '' : name, group: 'organization' };
  }
  return {
    code: course.alias ?? displayCode(course.code ?? course.name),
    name: canvasCourseTitle(course.name),
    group: course.isCurrent ? 'current' : 'past',
  };
}

/**
 * Every Canvas file the student can reach: the Files API index (`course_files`)
 * merged with File items from modules (many courses hide the Files tab, so
 * their files exist only as module items). Deduplicated per course by Canvas
 * file id; cached files open locally, the rest open in Canvas.
 */
export function getFileIndex(now = Date.now()): FileIndex {
  initializeDatabase();
  const { sqlite } = getDb();
  const courses = sqlite
    .prepare(
      `SELECT id, source_url AS url, name, course_code AS code, local_alias AS alias, term_name AS term, is_current AS isCurrent FROM courses`,
    )
    .all() as CourseRow[];
  const courseFiles = sqlite
    .prepare(
      `SELECT id, source_id AS fileId, course_id AS courseId, display_name AS displayName, filename, content_type AS contentType, size, source_url AS sourceUrl, local_path AS localPath, source_updated_at AS updatedAt FROM course_files`,
    )
    .all() as CourseFileRow[];
  const moduleFiles = sqlite
    .prepare(
      `SELECT m.id AS moduleId, m.source_id AS moduleSourceId, m.title AS moduleTitle, m.position AS modulePosition, m.source_url AS moduleUrl, m.course_id AS courseId,
              mi.content_id AS fileId, mi.title, mi.position AS itemPosition, mi.html_url AS htmlUrl, mi.content_details_json AS details
       FROM module_items mi JOIN modules m ON m.id = mi.module_id
       WHERE mi.type = 'File' AND mi.content_id IS NOT NULL
       ORDER BY m.position, mi.position`,
    )
    .all() as ModuleFileRow[];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const entries = new Map<string, FileEntry>();
  const lockedUntil = new Map<string, string>();

  for (const row of courseFiles) {
    const course = courseById.get(row.courseId);
    const cached = Boolean(row.localPath);
    const href = cached
      ? `/api/files/${row.id}`
      : (row.sourceUrl ??
        (course?.url ? `${course.url}/files/${row.fileId}` : null));
    if (!href) continue;
    const [typeLabel, kind] = fileType(
      [row.displayName, row.filename],
      row.contentType,
    );
    const key = `${row.courseId}:${row.fileId}`;
    entries.set(key, {
      key,
      canvasFileId: row.fileId,
      title: row.displayName,
      filename: row.filename === row.displayName ? null : row.filename,
      courseId: row.courseId,
      modules: [],
      kind,
      typeLabel,
      size: formatSize(row.size),
      href,
      cached,
      updatedAt: row.updatedAt,
      updatedLabel: formatDay(row.updatedAt),
      opensLabel: null,
    });
  }

  const modulesByCourse = new Map<
    number,
    Map<number, FileModuleGroup & { files: Set<string> }>
  >();
  for (const row of moduleFiles) {
    const course = courseById.get(row.courseId);
    const details = parseDetails(row.details);
    const key = `${row.courseId}:${row.fileId}`;
    let entry = entries.get(key);
    if (!entry) {
      const href =
        row.htmlUrl ??
        (course?.url ? `${course.url}/files/${row.fileId}` : null);
      if (!href) continue;
      const [typeLabel, kind] = fileType(
        [details.display_name ?? null, row.title],
        null,
      );
      entry = {
        key,
        canvasFileId: row.fileId,
        title: row.title,
        filename:
          details.display_name && details.display_name !== row.title
            ? details.display_name
            : null,
        courseId: row.courseId,
        modules: [],
        kind,
        typeLabel,
        size: null,
        href,
        cached: false,
        updatedAt: null,
        updatedLabel: null,
        opensLabel: null,
      };
      entries.set(key, entry);
    } else if (!entry.modules.length && row.title !== entry.title) {
      // The module item title is what the instructor named it in Canvas.
      entry.filename = entry.filename ?? entry.title;
      entry.title = row.title;
    }
    const unlockAt = details.lock_info?.unlock_at;
    if (details.locked_for_user && unlockAt && Date.parse(unlockAt) > now)
      lockedUntil.set(key, unlockAt);
    const existing = entry.modules.find((ref) => ref.id === row.moduleId);
    if (existing) {
      if (
        existing.itemPosition === null ||
        (row.itemPosition ?? Infinity) < existing.itemPosition
      )
        existing.itemPosition = row.itemPosition;
    } else {
      entry.modules.push({
        id: row.moduleId,
        title: row.moduleTitle,
        position: row.modulePosition,
        itemPosition: row.itemPosition,
      });
    }
    const courseModules = modulesByCourse.get(row.courseId) ?? new Map();
    modulesByCourse.set(row.courseId, courseModules);
    const group = courseModules.get(row.moduleId) ?? {
      id: row.moduleId,
      title: row.moduleTitle,
      position: row.modulePosition,
      count: 0,
      canvasUrl: course?.url
        ? `${course.url}/modules#module_${row.moduleSourceId}`
        : row.moduleUrl,
      files: new Set<string>(),
    };
    group.files.add(key);
    courseModules.set(row.moduleId, group);
  }

  for (const [key, unlockAt] of lockedUntil) {
    const entry = entries.get(key)!;
    if (!entry.cached) entry.opensLabel = formatDay(unlockAt);
  }

  const counts = new Map<number, { total: number; loose: number }>();
  for (const entry of entries.values()) {
    const count = counts.get(entry.courseId) ?? { total: 0, loose: 0 };
    count.total += 1;
    if (!entry.modules.length) count.loose += 1;
    counts.set(entry.courseId, count);
  }

  const classes: FileClass[] = courses
    .filter((course) => counts.has(course.id))
    .map((course) => {
      const count = counts.get(course.id)!;
      const modules: FileModuleGroup[] = [
        ...(modulesByCourse.get(course.id)?.values() ?? []),
      ]
        .sort(
          (a, b) =>
            (a.position ?? Infinity) - (b.position ?? Infinity) ||
            byTitle(a.title, b.title),
        )
        .map(({ files, ...group }) => ({ ...group, count: files.size }));
      if (modules.length && count.loose)
        modules.push({
          id: 'none',
          title: 'Not in a module',
          position: null,
          count: count.loose,
          canvasUrl: null,
        });
      return {
        id: course.id,
        ...classOf(course),
        count: count.total,
        modules,
        canvasUrl: course.url,
      };
    })
    .sort(
      (a, b) =>
        GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || byTitle(a.code, b.code),
    );

  const classOrder = new Map(classes.map((item, index) => [item.id, index]));
  const files = [...entries.values()];
  for (const entry of files)
    entry.modules.sort(
      (a, b) =>
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        byTitle(a.title, b.title),
    );
  // Modules are sorted, so `modules[0]` is the file's first appearance in the course outline.
  // (Infinity - Infinity is NaN, which is falsy and falls through to the next key.)
  files.sort(
    (a, b) =>
      classOrder.get(a.courseId)! - classOrder.get(b.courseId)! ||
      Number(Boolean(a.opensLabel)) - Number(Boolean(b.opensLabel)) ||
      (a.modules[0]?.position ?? Infinity) -
        (b.modules[0]?.position ?? Infinity) ||
      (a.modules[0]?.itemPosition ?? Infinity) -
        (b.modules[0]?.itemPosition ?? Infinity) ||
      byTitle(a.title, b.title),
  );

  return {
    files,
    classes,
    cachedCount: files.filter((entry) => entry.cached).length,
  };
}
