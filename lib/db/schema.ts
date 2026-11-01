import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const provenance = {
  sourceProvider: text('source_provider').notNull(),
  sourceId: text('source_id').notNull(),
  sourceUrl: text('source_url'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  sourceUpdatedAt: text('source_updated_at'),
  lastSyncedAt: text('last_synced_at').notNull(),
  rawSnapshotPath: text('raw_snapshot_path'),
  contentHash: text('content_hash'),
};

export const providers = sqliteTable('providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  authStatus: text('auth_status').notNull().default('UNKNOWN'),
  lastAttemptAt: text('last_attempt_at'),
  lastSuccessAt: text('last_success_at'),
  lastError: text('last_error'),
});

export const syncRuns = sqliteTable('sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  authStatus: text('auth_status'),
  entitiesSeen: integer('entities_seen').notNull().default(0),
  entitiesUpdated: integer('entities_updated').notNull().default(0),
  errorsJson: text('errors_json').notNull().default('[]'),
  warningsJson: text('warnings_json').notNull().default('[]'),
  timingsJson: text('timings_json').notNull().default('{}'),
  progressLabel: text('progress_label'),
});

export const courses = sqliteTable(
  'courses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    name: text('name').notNull(),
    courseCode: text('course_code'),
    shortName: text('short_name'),
    localAlias: text('local_alias'),
    section: text('section'),
    termName: text('term_name'),
    state: text('state'),
    enrollmentState: text('enrollment_state'),
    startAt: text('start_at'),
    endAt: text('end_at'),
    timeZone: text('time_zone'),
    syllabusUrl: text('syllabus_url'),
    syllabusHtml: text('syllabus_html'),
    syllabusText: text('syllabus_text'),
    homepageUrl: text('homepage_url'),
    imageUrl: text('image_url'),
    currentScore: real('current_score'),
    currentGrade: text('current_grade'),
    finalScore: real('final_score'),
    gradingSchemeJson: text('grading_scheme_json'),
    isCurrent: integer('is_current', { mode: 'boolean' })
      .notNull()
      .default(true),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_courses_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
    index('idx_courses_current').on(table.isCurrent),
  ],
);

export const coursePeople = sqliteTable(
  'course_people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    sourceId: text('source_id'),
    name: text('name').notNull(),
    role: text('role').notNull(),
    avatarUrl: text('avatar_url'),
  },
  (table) => [index('idx_course_people_course').on(table.courseId)],
);

export const assignmentGroups = sqliteTable(
  'assignment_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    name: text('name').notNull(),
    position: integer('position'),
    groupWeight: real('group_weight'),
    rulesJson: text('rules_json'),
  },
  (table) => [
    uniqueIndex('uq_assignment_groups_course_source').on(
      table.courseId,
      table.sourceId,
    ),
  ],
);

export const assignments = sqliteTable(
  'assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    assignmentGroupId: integer('assignment_group_id').references(
      () => assignmentGroups.id,
      { onDelete: 'set null' },
    ),
    title: text('title').notNull(),
    descriptionHtml: text('description_html'),
    sanitizedHtml: text('sanitized_html'),
    descriptionText: text('description_text'),
    pointsPossible: real('points_possible'),
    gradingType: text('grading_type'),
    submissionTypesJson: text('submission_types_json'),
    dueAt: text('due_at'),
    dueAtOriginal: text('due_at_original'),
    unlockAt: text('unlock_at'),
    lockAt: text('lock_at'),
    published: integer('published', { mode: 'boolean' }),
    workflowState: text('workflow_state'),
    allowedAttempts: integer('allowed_attempts'),
    attemptsUsed: integer('attempts_used'),
    rubricJson: text('rubric_json'),
    rubricSettingsJson: text('rubric_settings_json'),
    allDatesJson: text('all_dates_json'),
    externalToolName: text('external_tool_name'),
    externalToolUrl: text('external_tool_url'),
    quizId: text('quiz_id'),
    discussionId: text('discussion_id'),
    assignmentType: text('assignment_type'),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_assignments_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
    index('idx_assignments_course_due').on(table.courseId, table.dueAt),
    index('idx_assignments_due').on(table.dueAt),
  ],
);

export const assignmentOverrides = sqliteTable('assignment_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assignmentId: integer('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  sourceId: text('source_id'),
  title: text('title'),
  dueAt: text('due_at'),
  unlockAt: text('unlock_at'),
  lockAt: text('lock_at'),
  appliesToCurrentUser: integer('applies_to_current_user', { mode: 'boolean' })
    .notNull()
    .default(false),
  providerJson: text('provider_json'),
});

export const submissions = sqliteTable('submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assignmentId: integer('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' })
    .unique(),
  providerState: text('provider_state').notNull().default('UNSUBMITTED'),
  submittedAt: text('submitted_at'),
  attempt: integer('attempt'),
  submissionType: text('submission_type'),
  submissionUrl: text('submission_url'),
  score: real('score'),
  grade: text('grade'),
  enteredGrade: text('entered_grade'),
  late: integer('late', { mode: 'boolean' }).notNull().default(false),
  missing: integer('missing', { mode: 'boolean' }).notNull().default(false),
  excused: integer('excused', { mode: 'boolean' }).notNull().default(false),
  gradedAt: text('graded_at'),
  postedAt: text('posted_at'),
  secondsLate: integer('seconds_late'),
  attachmentsJson: text('attachments_json'),
  commentsJson: text('comments_json'),
  rubricAssessmentJson: text('rubric_assessment_json'),
  historyJson: text('history_json'),
  lastSyncedAt: text('last_synced_at').notNull(),
  providerJson: text('provider_json'),
});

export const localTaskMetadata = sqliteTable(
  'local_task_metadata',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assignmentId: integer('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .unique(),
    title: text('title'),
    courseId: integer('course_id').references(() => courses.id, {
      onDelete: 'set null',
    }),
    workflowStatus: text('workflow_status').notNull().default('NOT_STARTED'),
    notes: text('notes').notNull().default(''),
    priority: integer('priority').notNull().default(0),
    personalDueAt: text('personal_due_at'),
    estimatedMinutes: integer('estimated_minutes'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_local_tasks_status').on(table.workflowStatus)],
);

export const subtasks = sqliteTable('subtasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  localTaskId: integer('local_task_id')
    .notNull()
    .references(() => localTaskMetadata.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(0),
});

export const timerSessions = sqliteTable('timer_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  localTaskId: integer('local_task_id')
    .notNull()
    .references(() => localTaskMetadata.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  durationSeconds: integer('duration_seconds'),
});

export const modules = sqliteTable(
  'modules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position'),
    state: text('state'),
    unlockAt: text('unlock_at'),
    prerequisiteModuleIdsJson: text('prerequisite_module_ids_json'),
    completionRequirementsJson: text('completion_requirements_json'),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_modules_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
  ],
);

export const moduleItems = sqliteTable(
  'module_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    moduleId: integer('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    type: text('type'),
    position: integer('position'),
    contentId: text('content_id'),
    htmlUrl: text('html_url'),
    externalUrl: text('external_url'),
    completionRequirementJson: text('completion_requirement_json'),
    contentDetailsJson: text('content_details_json'),
  },
  (table) => [
    uniqueIndex('uq_module_items_module_source').on(
      table.moduleId,
      table.sourceId,
    ),
  ],
);

export const announcements = sqliteTable(
  'announcements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    messageHtml: text('message_html'),
    messageText: text('message_text'),
    authorName: text('author_name'),
    postedAt: text('posted_at'),
    editedAt: text('edited_at'),
    readState: text('read_state'),
    attachmentsJson: text('attachments_json'),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_announcements_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
    index('idx_announcements_posted').on(table.postedAt),
  ],
);

export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug'),
    bodyHtml: text('body_html'),
    bodyText: text('body_text'),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_pages_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
  ],
);

export const courseFiles = sqliteTable(
  'course_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    folderId: text('folder_id'),
    displayName: text('display_name').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type'),
    size: integer('size'),
    downloadUrl: text('download_url'),
    localPath: text('local_path'),
    fileHash: text('file_hash'),
  },
  (table) => [
    uniqueIndex('uq_files_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
  ],
);

export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    courseId: integer('course_id').references(() => courses.id, {
      onDelete: 'cascade',
    }),
    assignmentId: integer('assignment_id').references(() => assignments.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    startAt: text('start_at'),
    endAt: text('end_at'),
    allDay: integer('all_day', { mode: 'boolean' }),
    eventType: text('event_type'),
  },
  (table) => [
    uniqueIndex('uq_events_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
  ],
);

export const gradeSnapshots = sqliteTable(
  'grade_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    capturedAt: text('captured_at').notNull(),
    currentScore: real('current_score'),
    currentGrade: text('current_grade'),
    finalScore: real('final_score'),
    pointsEarned: real('points_earned'),
    pointsPossible: real('points_possible'),
    sourceJson: text('source_json'),
  },
  (table) => [
    index('idx_grade_snapshots_course_time').on(
      table.courseId,
      table.capturedAt,
    ),
  ],
);

export const changeEvents = sqliteTable(
  'change_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id').references(() => courses.id, {
      onDelete: 'cascade',
    }),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    changeType: text('change_type').notNull(),
    summary: text('summary').notNull(),
    previousJson: text('previous_json'),
    currentJson: text('current_json'),
    detectedAt: text('detected_at').notNull(),
    syncRunId: integer('sync_run_id').references(() => syncRuns.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('idx_change_events_time').on(table.detectedAt)],
);

export const sourceDocuments = sqliteTable(
  'source_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    entityType: text('entity_type').notNull(),
    entitySourceId: text('entity_source_id').notNull(),
    courseId: integer('course_id').references(() => courses.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    bodyText: text('body_text').notNull().default(''),
    sourceUrl: text('source_url'),
    localPath: text('local_path'),
    contentHash: text('content_hash'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_source_documents_provider_entity').on(
      table.provider,
      table.entityType,
      table.entitySourceId,
    ),
  ],
);

export const importedArtifacts = sqliteTable('imported_artifacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  courseId: integer('course_id').references(() => courses.id, {
    onDelete: 'set null',
  }),
  assignmentId: integer('assignment_id').references(() => assignments.id, {
    onDelete: 'set null',
  }),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  localPath: text('local_path').notNull(),
  contentHash: text('content_hash'),
  importedAt: text('imported_at').notNull(),
  parsedJson: text('parsed_json'),
});

/**
 * Handshake campus events. Sync owns every column except the local flag
 * `dismissed_at`, which only the user changes.
 */
export const campusEvents = sqliteTable(
  'campus_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...provenance,
    title: text('title').notNull(),
    organizerName: text('organizer_name'),
    employerSourceId: text('employer_source_id'),
    category: text('category'),
    eventType: text('event_type'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    timeZone: text('time_zone'),
    whenLabel: text('when_label'),
    location: text('location'),
    isVirtual: integer('is_virtual', { mode: 'boolean' })
      .notNull()
      .default(false),
    eventFormat: text('event_format'),
    rsvpStatus: text('rsvp_status'),
    postedBySchool: integer('posted_by_school', { mode: 'boolean' })
      .notNull()
      .default(false),
    descriptionText: text('description_text'),
    imageUrl: text('image_url'),
    logoUrl: text('logo_url'),
    listRank: integer('list_rank'),
    relevanceScore: real('relevance_score'),
    relevanceReasonsJson: text('relevance_reasons_json'),
    dismissedAt: text('dismissed_at'),
    providerJson: text('provider_json'),
  },
  (table) => [
    uniqueIndex('uq_campus_events_provider_source').on(
      table.sourceProvider,
      table.sourceId,
    ),
    index('idx_campus_events_starts_at').on(table.startsAt),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
