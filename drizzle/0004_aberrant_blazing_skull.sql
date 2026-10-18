CREATE TABLE `answer_feedback` (
	`user_id` text NOT NULL,
	`exchange_id` text NOT NULL,
	`book_name` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`rating` text NOT NULL,
	`tags` text NOT NULL,
	`comment` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `exchange_id`)
);
--> statement-breakpoint
CREATE TABLE `reader_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`updated_at` text NOT NULL
);
