CREATE TABLE `auth_registration_days` (
	`date` text PRIMARY KEY NOT NULL,
	`registrations` integer DEFAULT 0 NOT NULL
);
