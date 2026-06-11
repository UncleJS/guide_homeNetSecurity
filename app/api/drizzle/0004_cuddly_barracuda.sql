ALTER TABLE `device_ports` ADD `source` enum('manual','scan') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `device_ports` ADD `last_seen_at_UTC` datetime;--> statement-breakpoint
ALTER TABLE `device_ports` ADD `device_port_active` varchar(64) GENERATED ALWAYS AS ((case when archived_at_UTC is null then concat(device_id, '-', port, '-', protocol) else null end)) VIRTUAL;--> statement-breakpoint
ALTER TABLE `device_ports` ADD CONSTRAINT `uk_device_port_active` UNIQUE(`device_port_active`);