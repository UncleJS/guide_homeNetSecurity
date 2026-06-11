ALTER TABLE `device_ports` DROP INDEX `uk_device_port_active`;--> statement-breakpoint
ALTER TABLE `device_ports` DROP COLUMN `device_port_active`;--> statement-breakpoint
ALTER TABLE `device_ports` ADD `ip_address_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `device_ports` ADD CONSTRAINT `device_ports_ip_address_id_ip_addresses_id_fk` FOREIGN KEY (`ip_address_id`) REFERENCES `ip_addresses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_ports_ip` ON `device_ports` (`ip_address_id`);--> statement-breakpoint
ALTER TABLE `device_ports` ADD `device_port_active` varchar(64) GENERATED ALWAYS AS ((case when archived_at_UTC is null then concat(device_id, '-', coalesce(ip_address_id, 0), '-', port, '-', protocol) else null end)) VIRTUAL;--> statement-breakpoint
ALTER TABLE `device_ports` ADD CONSTRAINT `uk_device_port_active` UNIQUE(`device_port_active`);
