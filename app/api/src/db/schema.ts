import { sql } from "drizzle-orm";
import {
  mysqlTable,
  bigint,
  varchar,
  int,
  text,
  datetime,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// Shared lifecycle columns (archive-only, UTC-suffixed) ----------------------
const lifecycle = {
  createdAtUTC: datetime("created_at_UTC")
    .notNull()
    .default(sql`UTC_TIMESTAMP()`),
  updatedAtUTC: datetime("updated_at_UTC")
    .notNull()
    .default(sql`UTC_TIMESTAMP()`),
  archivedAtUTC: datetime("archived_at_UTC"),
};

export const TRUST_ZONES = ["mgmt", "trusted", "work", "iot", "guest"] as const;
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const ASSIGNMENT_TYPES = ["static", "dhcp", "reserved"] as const;
export const HARDENING_STATES = ["pending", "done", "na"] as const;
export const NOTE_CATEGORIES = ["history", "reference", "general"] as const;
export const NOTE_ENTITIES = ["subnet", "device", "ip_address"] as const;
export const LINK_TYPES = ["uplink", "wireless", "trunk", "logical"] as const;

// Subnets / VLANs ------------------------------------------------------------
export const subnets = mysqlTable("subnets", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  name: varchar("name", { length: 120 }).notNull(),
  cidr: varchar("cidr", { length: 43 }).notNull(), // fits IPv6 CIDR
  vlanId: int("vlan_id"),
  trustZone: mysqlEnum("trust_zone", TRUST_ZONES).notNull().default("trusted"),
  gateway: varchar("gateway", { length: 45 }),
  dnsServers: varchar("dns_servers", { length: 255 }),
  description: text("description"),
  ...lifecycle,
  // Unique among active rows only (MariaDB has no partial unique index).
  nameActive: varchar("name_active", { length: 120 }).generatedAlwaysAs(
    sql`(case when archived_at_UTC is null then name else null end)`,
    { mode: "virtual" },
  ),
  cidrActive: varchar("cidr_active", { length: 43 }).generatedAlwaysAs(
    sql`(case when archived_at_UTC is null then cidr else null end)`,
    { mode: "virtual" },
  ),
}, (t) => ({
  nameActiveUk: uniqueIndex("uk_subnets_name_active").on(t.nameActive),
  cidrActiveUk: uniqueIndex("uk_subnets_cidr_active").on(t.cidrActive),
  zoneIx: index("ix_subnets_zone").on(t.trustZone),
}));

// Devices --------------------------------------------------------------------
export const devices = mysqlTable("devices", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  deviceType: varchar("device_type", { length: 60 }),
  vendor: varchar("vendor", { length: 120 }),
  owner: varchar("owner", { length: 120 }),
  location: varchar("location", { length: 120 }),
  firmwareVersion: varchar("firmware_version", { length: 80 }),
  riskLevel: mysqlEnum("risk_level", RISK_LEVELS).notNull().default("low"),
  isGateway: int("is_gateway").notNull().default(0), // 1 = acts as a gateway/uplink root
  notes: text("notes"),
  posX: int("pos_x"), // saved map layout position
  posY: int("pos_y"),
  lastSeenUTC: datetime("last_seen_UTC"),
  ...lifecycle,
}, (t) => ({
  riskIx: index("ix_devices_risk").on(t.riskLevel),
}));

// IP addresses ---------------------------------------------------------------
export const ipAddresses = mysqlTable("ip_addresses", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  subnetId: bigint("subnet_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => subnets.id),
  deviceId: bigint("device_id", { mode: "number", unsigned: true })
    .references(() => devices.id),
  address: varchar("address", { length: 45 }).notNull(),
  assignmentType: mysqlEnum("assignment_type", ASSIGNMENT_TYPES)
    .notNull()
    .default("dhcp"),
  macAddress: varchar("mac_address", { length: 17 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  ...lifecycle,
  // address unique per subnet among active rows
  addrActive: varchar("addr_active", { length: 64 }).generatedAlwaysAs(
    sql`(case when archived_at_UTC is null then concat(subnet_id, '-', address) else null end)`,
    { mode: "virtual" },
  ),
  // mac unique among active rows (when present)
  macActive: varchar("mac_active", { length: 17 }).generatedAlwaysAs(
    sql`(case when archived_at_UTC is null then mac_address else null end)`,
    { mode: "virtual" },
  ),
}, (t) => ({
  addrActiveUk: uniqueIndex("uk_ip_addr_active").on(t.addrActive),
  macActiveUk: uniqueIndex("uk_ip_mac_active").on(t.macActive),
  subnetIx: index("ix_ip_subnet").on(t.subnetId),
  deviceIx: index("ix_ip_device").on(t.deviceId),
}));

// Device ports / services ----------------------------------------------------
export const devicePorts = mysqlTable("device_ports", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  deviceId: bigint("device_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => devices.id),
  port: int("port").notNull(),
  protocol: varchar("protocol", { length: 8 }).notNull().default("tcp"),
  service: varchar("service", { length: 80 }),
  notes: text("notes"),
  ...lifecycle,
}, (t) => ({
  deviceIx: index("ix_ports_device").on(t.deviceId),
}));

// Hardening checklist items --------------------------------------------------
export const hardeningItems = mysqlTable("hardening_items", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  deviceId: bigint("device_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => devices.id),
  control: varchar("control", { length: 200 }).notNull(),
  state: mysqlEnum("state", HARDENING_STATES).notNull().default("pending"),
  notes: text("notes"),
  completedAtUTC: datetime("completed_at_UTC"),
  ...lifecycle,
}, (t) => ({
  deviceIx: index("ix_hardening_device").on(t.deviceId),
}));

// Notes / history (polymorphic, append-style) --------------------------------
export const notes = mysqlTable("notes", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  entityType: mysqlEnum("entity_type", NOTE_ENTITIES).notNull(),
  entityId: bigint("entity_id", { mode: "number", unsigned: true }).notNull(),
  category: mysqlEnum("category", NOTE_CATEGORIES).notNull().default("general"),
  body: text("body").notNull(),
  author: varchar("author", { length: 120 }),
  ...lifecycle,
}, (t) => ({
  entityIx: index("ix_notes_entity").on(t.entityType, t.entityId),
}));

// Topology links (explicit device -> device uplinks) -------------------------
export const links = mysqlTable("links", {
  id: bigint("id", { mode: "number", unsigned: true })
    .primaryKey()
    .autoincrement(),
  sourceDeviceId: bigint("source_device_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => devices.id),
  targetDeviceId: bigint("target_device_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => devices.id),
  linkType: mysqlEnum("link_type", LINK_TYPES).notNull().default("uplink"),
  label: varchar("label", { length: 120 }),
  notes: text("notes"),
  ...lifecycle,
}, (t) => ({
  sourceIx: index("ix_links_source").on(t.sourceDeviceId),
  targetIx: index("ix_links_target").on(t.targetDeviceId),
}));
