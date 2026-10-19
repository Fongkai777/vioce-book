CREATE TABLE `operations_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`model` text NOT NULL,
	`policy` text NOT NULL,
	`reserved_micros` integer NOT NULL,
	`settled_micros` integer,
	`input_tokens` integer,
	`cached_tokens` integer,
	`output_tokens` integer
);
