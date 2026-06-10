CREATE TABLE `subnets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`cidr` varchar(43) NOT NULL,
	`vlan_id` int,
	`trust_zone` enum('mgmt','trusted','work','iot','guest') NOT NULL DEFAULT 'trusted',
	`gateway` varchar(45),
	`dns_servers` varchar(255),
	`description` text,
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	`name_active` varchar(120) GENERATED ALWAYS AS ((case when `archived_at_UTC` is null then `name` else null end)) VIRTUAL,
	`cidr_active` varchar(43) GENERATED ALWAYS AS ((case when `archived_at_UTC` is null then `cidr` else null end)) VIRTUAL,
	CONSTRAINT `subnets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_subnets_name_active` UNIQUE(`name_active`),
	CONSTRAINT `uk_subnets_cidr_active` UNIQUE(`cidr_active`)
);
--> statement-breakpoint
CREATE INDEX `ix_subnets_zone` ON `subnets` (`trust_zone`);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`device_type` varchar(60),
	`vendor` varchar(120),
	`owner` varchar(120),
	`location` varchar(120),
	`firmware_version` varchar(80),
	`risk_level` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`is_gateway` int NOT NULL DEFAULT 0,
	`notes` text,
	`pos_x` int,
	`pos_y` int,
	`last_seen_UTC` datetime,
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_devices_risk` ON `devices` (`risk_level`);
--> statement-breakpoint
CREATE TABLE `ip_addresses` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subnet_id` bigint unsigned NOT NULL,
	`device_id` bigint unsigned,
	`address` varchar(45) NOT NULL,
	`assignment_type` enum('static','dhcp','reserved') NOT NULL DEFAULT 'dhcp',
	`mac_address` varchar(17),
	`status` varchar(30) NOT NULL DEFAULT 'active',
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	`addr_active` varchar(64) GENERATED ALWAYS AS ((case when `archived_at_UTC` is null then concat(`subnet_id`, '-', `address`) else null end)) VIRTUAL,
	`mac_active` varchar(17) GENERATED ALWAYS AS ((case when `archived_at_UTC` is null then `mac_address` else null end)) VIRTUAL,
	CONSTRAINT `ip_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_ip_addr_active` UNIQUE(`addr_active`),
	CONSTRAINT `uk_ip_mac_active` UNIQUE(`mac_active`)
);
--> statement-breakpoint
CREATE INDEX `ix_ip_subnet` ON `ip_addresses` (`subnet_id`);
--> statement-breakpoint
CREATE INDEX `ix_ip_device` ON `ip_addresses` (`device_id`);
--> statement-breakpoint
CREATE TABLE `device_ports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`device_id` bigint unsigned NOT NULL,
	`port` int NOT NULL,
	`protocol` varchar(8) NOT NULL DEFAULT 'tcp',
	`service` varchar(80),
	`notes` text,
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	CONSTRAINT `device_ports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_ports_device` ON `device_ports` (`device_id`);
--> statement-breakpoint
CREATE TABLE `hardening_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`device_id` bigint unsigned NOT NULL,
	`control` varchar(200) NOT NULL,
	`state` enum('pending','done','na') NOT NULL DEFAULT 'pending',
	`notes` text,
	`completed_at_UTC` datetime,
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	CONSTRAINT `hardening_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_hardening_device` ON `hardening_items` (`device_id`);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`entity_type` enum('subnet','device','ip_address') NOT NULL,
	`entity_id` bigint unsigned NOT NULL,
	`category` enum('history','reference','general') NOT NULL DEFAULT 'general',
	`body` text NOT NULL,
	`author` varchar(120),
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_notes_entity` ON `notes` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source_device_id` bigint unsigned NOT NULL,
	`target_device_id` bigint unsigned NOT NULL,
	`link_type` enum('uplink','wireless','trunk','logical') NOT NULL DEFAULT 'uplink',
	`label` varchar(120),
	`notes` text,
	`created_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`updated_at_UTC` datetime NOT NULL DEFAULT (UTC_TIMESTAMP()),
	`archived_at_UTC` datetime,
	CONSTRAINT `links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_links_source` ON `links` (`source_device_id`);
--> statement-breakpoint
CREATE INDEX `ix_links_target` ON `links` (`target_device_id`);
