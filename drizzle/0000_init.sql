CREATE TABLE `clients` (
	`target_id` text PRIMARY KEY NOT NULL,
	`why_they_signed` text,
	`why_source` text,
	`segment` text,
	`signed_on` text,
	`what_they_do` text,
	`sources` text,
	`ch_match` text,
	`analysed_at` text,
	`analysed_by` text,
	`lookalikes_at` text,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`service` text NOT NULL,
	`secret` text NOT NULL,
	`last4` text NOT NULL,
	`status` text DEFAULT 'testing' NOT NULL,
	`last_tested_at` text,
	`last_used_at` text,
	`message` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_service_uq` ON `credentials` (`workspace_id`,`service`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`decision` text NOT NULL,
	`decided_at` text NOT NULL,
	`undone_at` text,
	`reason` text,
	`note` text,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `decisions_target_idx` ON `decisions` (`target_id`,`decided_at`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`from_type` text NOT NULL,
	`from_id` text NOT NULL,
	`to_type` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	`attributes` text,
	`source_id` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `links_from_idx` ON `links` (`from_type`,`from_id`);--> statement-breakpoint
CREATE INDEX `links_to_idx` ON `links` (`to_type`,`to_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`external_id` text,
	`attributes` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `people_external_idx` ON `people` (`workspace_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`postcode` text,
	`address` text,
	`lat` real,
	`lng` real,
	`borough` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `places_postcode_idx` ON `places` (`workspace_id`,`postcode`);--> statement-breakpoint
CREATE TABLE `raw_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_items_source_external_uq` ON `raw_items` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`score` integer NOT NULL,
	`summary` text NOT NULL,
	`what_they_do` text,
	`why_fit` text,
	`why_now` text,
	`suggested_reply` text,
	`possible_company_name` text,
	`sources` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_gbp` real,
	`reviewed_at` text NOT NULL,
	`run_id` text,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reviews_target_idx` ON `reviews` (`target_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `run_log` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_log_run_idx` ON `run_log` (`run_id`,`at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text,
	`find_lookalikes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`step` integer DEFAULT 1 NOT NULL,
	`counts` text,
	`summary` text,
	`summary_highlights` text,
	`error` text,
	`queued_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target_id` text,
	`source_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`occurred_at` text,
	`due_at` text,
	`weight` text DEFAULT 'normal' NOT NULL,
	`attributes` text,
	`external_id` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `signals_target_idx` ON `signals` (`target_id`);--> statement-breakpoint
CREATE INDEX `signals_due_idx` ON `signals` (`workspace_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `signals_external_idx` ON `signals` (`target_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `source_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`version` integer NOT NULL,
	`config` text NOT NULL,
	`saved_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_versions_uq` ON `source_versions` (`source_id`,`version`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connector` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`config` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`cursor` text,
	`credential_id` text,
	`last_run_at` text,
	`next_run_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`company_number` text,
	`url` text,
	`domain` text,
	`status` text,
	`incorporated_on` text,
	`sic_codes` text,
	`company_type` text,
	`place_id` text,
	`profile` text,
	`attributes` text,
	`first_seen_at` text NOT NULL,
	`first_source_id` text,
	`is_client` integer DEFAULT 0 NOT NULL,
	`is_demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`first_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `targets_company_number_uq` ON `targets` (`workspace_id`,`company_number`) WHERE company_number is not null and is_demo = 0;--> statement-breakpoint
CREATE INDEX `targets_workspace_kind_idx` ON `targets` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE INDEX `targets_domain_idx` ON `targets` (`workspace_id`,`domain`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`labels` text NOT NULL
);
