ALTER TABLE `device_ports` ADD CONSTRAINT `device_ports_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hardening_items` ADD CONSTRAINT `hardening_items_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_subnet_id_subnets_id_fk` FOREIGN KEY (`subnet_id`) REFERENCES `subnets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ip_addresses` ADD CONSTRAINT `ip_addresses_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `links` ADD CONSTRAINT `links_source_device_id_devices_id_fk` FOREIGN KEY (`source_device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `links` ADD CONSTRAINT `links_target_device_id_devices_id_fk` FOREIGN KEY (`target_device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;
