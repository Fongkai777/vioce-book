CREATE TABLE `operations_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations_metrics` (
	`date` text NOT NULL,
	`route` text NOT NULL,
	`status` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	`max_ms` integer DEFAULT 0 NOT NULL,
	`last_at` text NOT NULL,
	PRIMARY KEY(`date`, `route`, `status`)
);
--> statement-breakpoint
CREATE TABLE `operations_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`daily_budget_micros` integer DEFAULT 5000000 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`max_concurrent` integer DEFAULT 4 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations_usage` (
	`date` text PRIMARY KEY NOT NULL,
	`reserved_micros` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL
);
