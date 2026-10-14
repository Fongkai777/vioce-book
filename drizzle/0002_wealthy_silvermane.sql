CREATE TABLE `auth_login_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`window_started_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
