CREATE TABLE `comic_chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_entry_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text,
	`url` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_entry_id`) REFERENCES `comic_source_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comic_chapters_source_entry_url_uq` ON `comic_chapters` (`source_entry_id`,`url`);--> statement-breakpoint
CREATE INDEX `comic_chapters_source_entry_position_idx` ON `comic_chapters` (`source_entry_id`,`position`);--> statement-breakpoint
CREATE TABLE `comic_source_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comic_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`source_comic_key` text NOT NULL,
	`source_url` text NOT NULL,
	`view_count` integer,
	`serialization_status` text DEFAULT 'unknown' NOT NULL,
	`last_crawl_run_id` integer,
	`last_crawled_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `comic_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_crawl_run_id`) REFERENCES `crawl_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comic_source_entries_source_key_uq` ON `comic_source_entries` (`source_id`,`source_comic_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `comic_source_entries_source_url_uq` ON `comic_source_entries` (`source_id`,`source_url`);--> statement-breakpoint
CREATE INDEX `comic_source_entries_comic_id_idx` ON `comic_source_entries` (`comic_id`);--> statement-breakpoint
CREATE INDEX `comic_source_entries_source_id_idx` ON `comic_source_entries` (`source_id`);--> statement-breakpoint
CREATE INDEX `comic_source_entries_last_crawl_run_id_idx` ON `comic_source_entries` (`last_crawl_run_id`);--> statement-breakpoint
CREATE INDEX `comic_source_entries_source_status_idx` ON `comic_source_entries` (`source_id`,`serialization_status`);--> statement-breakpoint
CREATE INDEX `comic_source_entries_source_view_count_idx` ON `comic_source_entries` (`source_id`,`view_count`);--> statement-breakpoint
CREATE TABLE `comic_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comic_sources_key_uq` ON `comic_sources` (`key`);--> statement-breakpoint
CREATE TABLE `comic_tags` (
	`comic_id` integer NOT NULL,
	`normalized_tag` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`comic_id`, `normalized_tag`),
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comic_tags_normalized_tag_idx` ON `comic_tags` (`normalized_tag`);--> statement-breakpoint
CREATE TABLE `comics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_name` text NOT NULL,
	`name` text NOT NULL,
	`main_image_url` text,
	`intro` text,
	`last_source_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`last_source_id`) REFERENCES `comic_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comics_normalized_name_uq` ON `comics` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `comics_last_source_id_idx` ON `comics` (`last_source_id`);--> statement-breakpoint
CREATE TABLE `crawl_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`start_urls` text NOT NULL,
	`request_queue_name` text,
	`dataset_name` text,
	`pages_succeeded` integer DEFAULT 0 NOT NULL,
	`pages_failed` integer DEFAULT 0 NOT NULL,
	`comics_stored` integer DEFAULT 0 NOT NULL,
	`chapters_stored` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`source_id`) REFERENCES `comic_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crawl_runs_source_id_idx` ON `crawl_runs` (`source_id`);--> statement-breakpoint
CREATE INDEX `crawl_runs_status_idx` ON `crawl_runs` (`status`);--> statement-breakpoint
CREATE INDEX `crawl_runs_source_mode_id_idx` ON `crawl_runs` (`source_id`,`mode`,`id`);