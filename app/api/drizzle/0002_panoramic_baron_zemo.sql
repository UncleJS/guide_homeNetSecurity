CREATE TABLE `scan_findings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`hostname` varchar(255),
	`port` int NOT NULL,
	`protocol` varchar(8) NOT NULL DEFAULT 'tcp',
	`state` varchar(20) NOT NULL,
	`service` varchar(80),
	`notes` text,
	`created_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`updated_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`archived_at_UTC` datetime,
	CONSTRAINT `scan_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`schedule_id` bigint unsigned NOT NULL,
	`scheduled_for_UTC` datetime NOT NULL,
	`started_at_UTC` datetime,
	`finished_at_UTC` datetime,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`hosts_scanned` int NOT NULL DEFAULT 0,
	`open_ports` int NOT NULL DEFAULT 0,
	`error` text,
	`created_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`updated_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`archived_at_UTC` datetime,
	CONSTRAINT `scan_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scan_schedules` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`target_type` enum('subnet','device') NOT NULL,
	`subnet_id` bigint unsigned,
	`device_id` bigint unsigned,
	`port_spec` varchar(255) NOT NULL DEFAULT 'top100',
	`recurrence` enum('once','daily','weekly','monthly','quarterly') NOT NULL DEFAULT 'once',
	`next_run_at_UTC` datetime NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`reminder_minutes_before` int,
	`reminder_email` varchar(255),
	`reminder_sent_for_UTC` datetime,
	`description` text,
	`created_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`updated_at_UTC` datetime NOT NULL DEFAULT UTC_TIMESTAMP(),
	`archived_at_UTC` datetime,
	`name_active` varchar(120) GENERATED ALWAYS AS ((case when archived_at_UTC is null then name else null end)) VIRTUAL,
	CONSTRAINT `scan_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_scan_schedules_name_active` UNIQUE(`name_active`)
);
--> statement-breakpoint
ALTER TABLE `notes` MODIFY COLUMN `entity_type` enum('subnet','device','ip_address','scan_run') NOT NULL;--> statement-breakpoint
ALTER TABLE `scan_findings` ADD CONSTRAINT `scan_findings_run_id_scan_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD CONSTRAINT `scan_runs_schedule_id_scan_schedules_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `scan_schedules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scan_schedules` ADD CONSTRAINT `scan_schedules_subnet_id_subnets_id_fk` FOREIGN KEY (`subnet_id`) REFERENCES `subnets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scan_schedules` ADD CONSTRAINT `scan_schedules_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_scan_findings_run` ON `scan_findings` (`run_id`);--> statement-breakpoint
CREATE INDEX `ix_scan_runs_schedule` ON `scan_runs` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `ix_scan_runs_scheduled_for` ON `scan_runs` (`scheduled_for_UTC`);--> statement-breakpoint
CREATE INDEX `ix_scan_schedules_next_run` ON `scan_schedules` (`next_run_at_UTC`);