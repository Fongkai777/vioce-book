CREATE TABLE `app_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_usage` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`question_count` integer DEFAULT 0 NOT NULL,
	`voice_seconds` integer DEFAULT 0 NOT NULL,
	`embedding_characters` integer DEFAULT 0 NOT NULL,
	`speech_characters` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quota_overrides` (
	`user_id` text PRIMARY KEY NOT NULL,
	`question_limit` integer DEFAULT 20 NOT NULL,
	`voice_seconds_limit` integer DEFAULT 600 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
