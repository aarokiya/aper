/** Shared (server + client) shapes for the unified Canvas file index. */

export type FileKind = 'pdf' | 'slides' | 'docs' | 'other';

export const FILE_KINDS: FileKind[] = ['pdf', 'slides', 'docs', 'other'];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  pdf: 'PDF',
  slides: 'Slides',
  docs: 'Docs',
  other: 'Other',
};

/** A module a file appears in, with the file's position inside it. */
export type FileModuleRef = {
  id: number;
  title: string;
  position: number | null;
  itemPosition: number | null;
};

export type FileEntry = {
  /** `<courseId>:<canvasFileId>`, unique across the index */
  key: string;
  canvasFileId: string;
  title: string;
  /** Canvas file name when it differs from the title (search only) */
  filename: string | null;
  courseId: number;
  modules: FileModuleRef[];
  kind: FileKind;
  /** e.g. `PDF`, `Slides`, `Spreadsheet` */
  typeLabel: string;
  /** human size, e.g. `2.4 MB`, when known */
  size: string | null;
  /** `/api/files/<id>` when cached, else a Canvas URL */
  href: string;
  cached: boolean;
  updatedAt: string | null;
  /** `Aug 17` (server-local), when Canvas reported an update time */
  updatedLabel: string | null;
  /** `Dec 8` when the file is locked until a future date */
  opensLabel: string | null;
};

/** `none` = files that are in no module of their class. */
export type FileModuleId = number | 'none';

export type FileModuleGroup = {
  id: FileModuleId;
  title: string;
  position: number | null;
  /** distinct files in this module */
  count: number;
  canvasUrl: string | null;
};

export type FileClassGroup = 'current' | 'organization' | 'past';

export type FileClass = {
  id: number;
  /** `ABC 1234`, the alias, or the organization name */
  code: string;
  name: string;
  group: FileClassGroup;
  count: number;
  /** modules that contain files, in Canvas order, then `none` when applicable */
  modules: FileModuleGroup[];
  canvasUrl: string | null;
};

export type FileIndex = {
  /** class order → unlocked first → module order → item order → title */
  files: FileEntry[];
  classes: FileClass[];
  cachedCount: number;
};

export const FILE_CLASS_GROUP_LABELS: Record<FileClassGroup, string> = {
  current: 'Classes',
  organization: 'Organizations',
  past: 'Past classes',
};
