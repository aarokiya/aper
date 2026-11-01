CREATE TABLE `jobs` (
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
	`title` text NOT NULL,
	`employer_name` text NOT NULL,
	`employer_source_id` text,
	`industry` text,
	`employment_type` text,
	`schedule` text,
	`location` text,
	`is_remote` integer DEFAULT false NOT NULL,
	`compensation` text,
	`posted_label` text,
	`apply_by` text,
	`starts_at` text,
	`ends_at` text,
	`work_authorization` text,
	`description_text` text,
	`qualifications_json` text,
	`employer_size` text,
	`employer_location` text,
	`employer_description` text,
	`logo_url` text,
	`search_page` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`provider_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_jobs_provider_source` ON `jobs` (`source_provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_apply_by` ON `jobs` (`apply_by`);--> statement-breakpoint
CREATE INDEX `idx_jobs_last_seen` ON `jobs` (`last_seen_at`);