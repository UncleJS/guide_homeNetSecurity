ALTER TABLE `notes` MODIFY COLUMN `entity_type` enum('subnet','device','ip_address','scan_run');--> statement-breakpoint
ALTER TABLE `notes` MODIFY COLUMN `entity_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `notes` ADD `status` enum('open','done');--> statement-breakpoint
ALTER TABLE `notes` ADD `priority` enum('low','medium','high');--> statement-breakpoint
ALTER TABLE `notes` ADD `due_at_UTC` datetime;--> statement-breakpoint
ALTER TABLE `notes` ADD `done_at_UTC` datetime;--> statement-breakpoint
CREATE INDEX `ix_notes_status_due` ON `notes` (`status`,`due_at_UTC`);