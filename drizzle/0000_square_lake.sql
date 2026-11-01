CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer NOT NULL,
	`title` text NOT NULL,
	`message_html` text,
	`message_text` text,
	`author_name` text,
	`posted_at` text,
	`edited_at` text,
	`read_state` text,
	`attachments_json` text,
	`provider_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_announcements_provider_source` ON `announcements` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_announcements_posted` ON `announcements` (`posted_at`);--> statement-breakpoint
CREATE TABLE `assignment_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer,
	`group_weight` real,
	`rules_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignment_groups_course_source` ON `assignment_groups` (`course_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `assignment_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`source_id` text,
	`title` text,
	`due_at` text,
	`unlock_at` text,
	`lock_at` text,
	`applies_to_current_user` integer DEFAULT false NOT NULL,
	`provider_json` text,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer NOT NULL,
	`assignment_group_id` integer,
	`title` text NOT NULL,
	`description_html` text,
	`sanitized_html` text,
	`description_text` text,
	`points_possible` real,
	`grading_type` text,
	`submission_types_json` text,
	`due_at` text,
	`due_at_original` text,
	`unlock_at` text,
	`lock_at` text,
	`published` integer,
	`workflow_state` text,
	`allowed_attempts` integer,
	`attempts_used` integer,
	`rubric_json` text,
	`rubric_settings_json` text,
	`all_dates_json` text,
	`external_tool_name` text,
	`external_tool_url` text,
	`quiz_id` text,
	`discussion_id` text,
	`assignment_type` text,
	`provider_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_group_id`) REFERENCES `assignment_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignments_provider_source` ON `assignments` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_assignments_course_due` ON `assignments` (`course_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_assignments_due` ON `assignments` (`due_at`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer,
	`assignment_id` integer,
	`title` text NOT NULL,
	`description` text,
	`start_at` text,
	`end_at` text,
	`all_day` integer,
	`event_type` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_events_provider_source` ON `calendar_events` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE TABLE `change_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`change_type` text NOT NULL,
	`summary` text NOT NULL,
	`previous_json` text,
	`current_json` text,
	`detected_at` text NOT NULL,
	`sync_run_id` integer,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_change_events_time` ON `change_events` (`detected_at`);--> statement-breakpoint
CREATE TABLE `course_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer NOT NULL,
	`folder_id` text,
	`display_name` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text,
	`size` integer,
	`download_url` text,
	`local_path` text,
	`file_hash` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_files_provider_source` ON `course_files` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE TABLE `course_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`source_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`avatar_url` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_course_people_course` ON `course_people` (`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`name` text NOT NULL,
	`course_code` text,
	`short_name` text,
	`local_alias` text,
	`section` text,
	`term_name` text,
	`state` text,
	`enrollment_state` text,
	`start_at` text,
	`end_at` text,
	`time_zone` text,
	`syllabus_url` text,
	`syllabus_html` text,
	`syllabus_text` text,
	`homepage_url` text,
	`image_url` text,
	`current_score` real,
	`current_grade` text,
	`final_score` real,
	`grading_scheme_json` text,
	`is_current` integer DEFAULT true NOT NULL,
	`provider_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_courses_provider_source` ON `courses` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_courses_current` ON `courses` (`is_current`);--> statement-breakpoint
CREATE TABLE `grade_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`captured_at` text NOT NULL,
	`current_score` real,
	`current_grade` text,
	`final_score` real,
	`points_earned` real,
	`points_possible` real,
	`source_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_grade_snapshots_course_time` ON `grade_snapshots` (`course_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `imported_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`course_id` integer,
	`assignment_id` integer,
	`filename` text NOT NULL,
	`content_type` text,
	`local_path` text NOT NULL,
	`content_hash` text,
	`imported_at` text NOT NULL,
	`parsed_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `local_task_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer,
	`title` text,
	`course_id` integer,
	`workflow_status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`personal_due_at` text,
	`estimated_minutes` integer,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_task_metadata_assignment_id_unique` ON `local_task_metadata` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_local_tasks_status` ON `local_task_metadata` (`workflow_status`);--> statement-breakpoint
CREATE TABLE `module_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`position` integer,
	`content_id` text,
	`html_url` text,
	`external_url` text,
	`completion_requirement_json` text,
	`content_details_json` text,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_module_items_module_source` ON `module_items` (`module_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer NOT NULL,
	`title` text NOT NULL,
	`position` integer,
	`state` text,
	`unlock_at` text,
	`prerequisite_module_ids_json` text,
	`completion_requirements_json` text,
	`provider_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_modules_provider_source` ON `modules` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_provider` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`source_updated_at` text,
	`last_synced_at` text NOT NULL,
	`raw_snapshot_path` text,
	`content_hash` text,
	`course_id` integer NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`body_html` text,
	`body_text` text,
	`provider_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pages_provider_source` ON `pages` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`auth_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `providers_key_unique` ON `providers` (`key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_source_id` text NOT NULL,
	`course_id` integer,
	`title` text NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`source_url` text,
	`local_path` text,
	`content_hash` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_documents_provider_entity` ON `source_documents` (`provider`,`entity_type`,`entity_source_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`provider_state` text DEFAULT 'UNSUBMITTED' NOT NULL,
	`submitted_at` text,
	`attempt` integer,
	`submission_type` text,
	`submission_url` text,
	`score` real,
	`grade` text,
	`entered_grade` text,
	`late` integer DEFAULT false NOT NULL,
	`missing` integer DEFAULT false NOT NULL,
	`excused` integer DEFAULT false NOT NULL,
	`graded_at` text,
	`posted_at` text,
	`seconds_late` integer,
	`attachments_json` text,
	`comments_json` text,
	`rubric_assessment_json` text,
	`history_json` text,
	`last_synced_at` text NOT NULL,
	`provider_json` text,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_assignment_id_unique` ON `submissions` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_task_id` integer NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`local_task_id`) REFERENCES `local_task_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`auth_status` text,
	`entities_seen` integer DEFAULT 0 NOT NULL,
	`entities_updated` integer DEFAULT 0 NOT NULL,
	`errors_json` text DEFAULT '[]' NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`timings_json` text DEFAULT '{}' NOT NULL,
	`progress_label` text
);
--> statement-breakpoint
CREATE TABLE `timer_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_task_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer,
	FOREIGN KEY (`local_task_id`) REFERENCES `local_task_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
