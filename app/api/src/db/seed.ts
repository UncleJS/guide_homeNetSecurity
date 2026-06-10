import { sql } from "drizzle-orm";
import { db } from "./client.ts";
import {
  subnets, devices, ipAddresses, devicePorts, hardeningItems, notes, links,
} from "./schema.ts";
import { DEFAULT_HARDENING_CONTROLS } from "../lib/hardening.ts";

// Demo seed: a realistic segmented home/prosumer network. Idempotent — it clears
// the tables first, so it is safe to re-run. (Hard delete is fine HERE because this
// is a dev seed utility, not app behaviour; the app itself is archive-only.)
console.log("Clearing existing data…");
await db.delete(links);
await db.delete(notes);
await db.delete(hardeningItems);
await db.delete(devicePorts);
await db.delete(ipAddresses);
await db.delete(devices);
await db.delete(subnets);

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

console.log("Seeding subnets…");
const Z: Record<string, number> = {};
for (const s of [
  { key: "mgmt",    name: "Management",  cidr: "192.168.10.0/24", vlanId: 10, trustZone: "mgmt" as const,    gateway: "192.168.10.1", dnsServers: "192.168.10.5", description: "Network gear admin — reachable only from trusted" },
  { key: "trusted", name: "Trusted LAN", cidr: "192.168.20.0/24", vlanId: 20, trustZone: "trusted" as const, gateway: "192.168.20.1", dnsServers: "192.168.10.5", description: "Personal laptops, phones, NAS" },
  { key: "work",    name: "Work",        cidr: "192.168.30.0/24", vlanId: 30, trustZone: "work" as const,    gateway: "192.168.30.1", dnsServers: "192.168.10.5", description: "Work laptop — isolated from home LAN" },
  { key: "iot",     name: "IoT",         cidr: "192.168.40.0/24", vlanId: 40, trustZone: "iot" as const,     gateway: "192.168.40.1", dnsServers: "192.168.40.1", description: "Cameras, TV, smart-home — internet-only, no LAN access" },
  { key: "guest",   name: "Guest",       cidr: "192.168.50.0/24", vlanId: 50, trustZone: "guest" as const,   gateway: "192.168.50.1", description: "Visitors — fully isolated" },
]) {
  const { key, ...row } = s;
  const [{ id }] = await db.insert(subnets).values(row).$returningId();
  Z[key] = id;
}

// Device catalogue. parent = hostname of the upstream device for an explicit uplink.
type Dev = {
  hostname: string; deviceType: string; vendor: string; owner: string; location: string;
  riskLevel: "low" | "medium" | "high" | "critical"; isGateway?: boolean;
  zone: keyof typeof Z; ip: string; mac: string;
  assignment: "static" | "dhcp" | "reserved"; firmware?: string; seenDays: number;
  ports?: Array<{ port: number; protocol?: string; service: string }>;
  hardenDone: number; // how many of the default controls are marked done
  parent?: string; linkType?: "uplink" | "wireless" | "trunk" | "logical";
};

const catalog: Dev[] = [
  // ── Management / infrastructure ───────────────────────────────────────────
  { hostname: "opnsense-fw", deviceType: "firewall", vendor: "OPNsense", owner: "admin", location: "rack", riskLevel: "medium", isGateway: true, zone: "mgmt", ip: "192.168.10.1", mac: "fc:ec:da:00:00:01", assignment: "static", firmware: "24.7", seenDays: 0, hardenDone: 6, ports: [{ port: 443, service: "Web admin (https)" }, { port: 51820, protocol: "udp", service: "WireGuard VPN" }] },
  { hostname: "core-switch", deviceType: "switch", vendor: "UniFi USW-24", owner: "admin", location: "rack", riskLevel: "low", zone: "mgmt", ip: "192.168.10.2", mac: "fc:ec:da:00:00:02", assignment: "static", firmware: "7.0.50", seenDays: 0, hardenDone: 5, parent: "opnsense-fw", linkType: "uplink" },
  { hostname: "ap-living", deviceType: "access_point", vendor: "UniFi U6-Pro", owner: "admin", location: "living room", riskLevel: "low", isGateway: false, zone: "mgmt", ip: "192.168.10.3", mac: "fc:ec:da:00:00:03", assignment: "static", firmware: "6.6.55", seenDays: 0, hardenDone: 5, parent: "core-switch", linkType: "uplink" },
  { hostname: "ap-upstairs", deviceType: "access_point", vendor: "UniFi U6-Lite", owner: "admin", location: "landing", riskLevel: "low", zone: "mgmt", ip: "192.168.10.4", mac: "fc:ec:da:00:00:04", assignment: "static", firmware: "6.6.55", seenDays: 0, hardenDone: 5, parent: "core-switch", linkType: "uplink" },
  { hostname: "pihole", deviceType: "dns", vendor: "Raspberry Pi 4", owner: "admin", location: "rack", riskLevel: "medium", zone: "mgmt", ip: "192.168.10.5", mac: "fc:ec:da:00:00:05", assignment: "static", firmware: "Pi-hole 6", seenDays: 0, hardenDone: 4, parent: "core-switch", linkType: "uplink", ports: [{ port: 53, protocol: "udp", service: "DNS" }, { port: 80, service: "Pi-hole admin" }] },

  // ── Trusted LAN ───────────────────────────────────────────────────────────
  { hostname: "nas-synology", deviceType: "nas", vendor: "Synology DS920+", owner: "family", location: "office", riskLevel: "medium", zone: "trusted", ip: "192.168.20.5", mac: "00:11:32:00:00:10", assignment: "reserved", firmware: "DSM 7.2", seenDays: 0, hardenDone: 5, parent: "core-switch", linkType: "uplink", ports: [{ port: 443, service: "DSM (https)" }, { port: 445, service: "SMB" }, { port: 5001, service: "DSM alt" }] },
  { hostname: "desktop-pc", deviceType: "desktop", vendor: "Custom / Win11", owner: "you", location: "office", riskLevel: "high", zone: "trusted", ip: "192.168.20.10", mac: "00:11:32:00:00:11", assignment: "reserved", firmware: "Win11 23H2", seenDays: 0, hardenDone: 4, parent: "core-switch", linkType: "uplink", ports: [{ port: 3389, service: "RDP (LAN only — verify!)" }] },
  { hostname: "macbook-pro", deviceType: "laptop", vendor: "Apple", owner: "you", location: "roaming", riskLevel: "low", zone: "trusted", ip: "192.168.20.11", mac: "ac:de:48:00:00:12", assignment: "dhcp", firmware: "macOS 14", seenDays: 1, hardenDone: 5, parent: "ap-living", linkType: "wireless" },
  { hostname: "iphone-15", deviceType: "phone", vendor: "Apple", owner: "you", location: "roaming", riskLevel: "low", zone: "trusted", ip: "192.168.20.20", mac: "ac:de:48:00:00:13", assignment: "dhcp", seenDays: 0, hardenDone: 6, parent: "ap-living", linkType: "wireless" },
  { hostname: "ipad-air", deviceType: "tablet", vendor: "Apple", owner: "family", location: "living room", riskLevel: "low", zone: "trusted", ip: "192.168.20.21", mac: "ac:de:48:00:00:14", assignment: "dhcp", seenDays: 3, hardenDone: 5, parent: "ap-living", linkType: "wireless" },
  { hostname: "hp-printer", deviceType: "printer", vendor: "HP LaserJet", owner: "family", location: "office", riskLevel: "medium", zone: "trusted", ip: "192.168.20.30", mac: "00:11:32:00:00:15", assignment: "reserved", firmware: "2019 (EOL)", seenDays: 12, hardenDone: 2, parent: "core-switch", linkType: "uplink", ports: [{ port: 9100, service: "Raw print" }, { port: 631, service: "IPP" }] },

  // ── Work (isolated) ───────────────────────────────────────────────────────
  { hostname: "work-laptop", deviceType: "laptop", vendor: "Dell / Win11", owner: "you", location: "office", riskLevel: "low", zone: "work", ip: "192.168.30.10", mac: "00:11:32:00:00:20", assignment: "dhcp", firmware: "Win11 + MDM", seenDays: 2, hardenDone: 6, parent: "ap-upstairs", linkType: "wireless" },

  // ── IoT (internet-only) ───────────────────────────────────────────────────
  { hostname: "doorbell-cam", deviceType: "camera", vendor: "Reolink", owner: "family", location: "front door", riskLevel: "high", zone: "iot", ip: "192.168.40.20", mac: "ec:71:db:00:00:30", assignment: "reserved", firmware: "3.1 (check CVE)", seenDays: 0, hardenDone: 2, parent: "ap-upstairs", linkType: "wireless", ports: [{ port: 554, service: "RTSP" }, { port: 80, service: "Web UI" }] },
  { hostname: "lg-tv", deviceType: "tv", vendor: "LG webOS", owner: "family", location: "living room", riskLevel: "medium", zone: "iot", ip: "192.168.40.10", mac: "ec:71:db:00:00:31", assignment: "dhcp", firmware: "webOS 6", seenDays: 1, hardenDone: 1, parent: "ap-living", linkType: "wireless", ports: [{ port: 8001, service: "webOS control" }] },
  { hostname: "ecobee-thermostat", deviceType: "thermostat", vendor: "ecobee", owner: "family", location: "hallway", riskLevel: "medium", zone: "iot", ip: "192.168.40.21", mac: "ec:71:db:00:00:32", assignment: "dhcp", seenDays: 0, hardenDone: 2, parent: "ap-upstairs", linkType: "wireless" },
  { hostname: "smart-plug-1", deviceType: "smart_plug", vendor: "TP-Link Kasa", owner: "family", location: "lounge", riskLevel: "medium", zone: "iot", ip: "192.168.40.22", mac: "ec:71:db:00:00:33", assignment: "dhcp", seenDays: 0, hardenDone: 1, parent: "ap-living", linkType: "wireless" },
  { hostname: "echo-dot", deviceType: "voice_assistant", vendor: "Amazon", owner: "family", location: "kitchen", riskLevel: "medium", zone: "iot", ip: "192.168.40.23", mac: "ec:71:db:00:00:34", assignment: "dhcp", seenDays: 0, hardenDone: 2, parent: "ap-living", linkType: "wireless" },
  { hostname: "robovac", deviceType: "robot_vacuum", vendor: "Roborock", owner: "family", location: "roaming", riskLevel: "medium", zone: "iot", ip: "192.168.40.24", mac: "ec:71:db:00:00:35", assignment: "dhcp", firmware: "EOL 2021", seenDays: 45, hardenDone: 0, parent: "ap-upstairs", linkType: "wireless" },

  // ── Guest ─────────────────────────────────────────────────────────────────
  { hostname: "guest-phone", deviceType: "phone", vendor: "unknown", owner: "visitor", location: "roaming", riskLevel: "medium", zone: "guest", ip: "192.168.50.10", mac: "5a:11:22:00:00:40", assignment: "dhcp", seenDays: 5, hardenDone: 0, parent: "ap-living", linkType: "wireless" },
];

console.log(`Seeding ${catalog.length} devices…`);
const id: Record<string, number> = {};
for (const d of catalog) {
  const [{ id: devId }] = await db.insert(devices).values({
    hostname: d.hostname, deviceType: d.deviceType, vendor: d.vendor, owner: d.owner,
    location: d.location, riskLevel: d.riskLevel, isGateway: d.isGateway ? 1 : 0,
    firmwareVersion: d.firmware ?? null, lastSeenUTC: daysAgo(d.seenDays),
  }).$returningId();
  id[d.hostname] = devId;

  await db.insert(ipAddresses).values({
    subnetId: Z[d.zone], deviceId: devId, address: d.ip,
    assignmentType: d.assignment, macAddress: d.mac,
  });

  if (d.ports?.length) {
    await db.insert(devicePorts).values(
      d.ports.map((p) => ({ deviceId: devId, port: p.port, protocol: p.protocol ?? "tcp", service: p.service })),
    );
  }

  // Default hardening checklist; mark the first `hardenDone` controls as done.
  await db.insert(hardeningItems).values(
    DEFAULT_HARDENING_CONTROLS.map((control, i) => ({
      deviceId: devId,
      control,
      state: i < d.hardenDone ? ("done" as const) : ("pending" as const),
      completedAtUTC: i < d.hardenDone ? daysAgo(d.seenDays + 1) : null,
    })),
  );
}

console.log("Seeding explicit topology links…");
const linkRows = catalog
  .filter((d) => d.parent && id[d.parent])
  .map((d) => ({ sourceDeviceId: id[d.hostname], targetDeviceId: id[d.parent!], linkType: d.linkType ?? "uplink", label: `${d.hostname} → ${d.parent}` }));
if (linkRows.length) await db.insert(links).values(linkRows);

console.log("Seeding notes…");
await db.insert(notes).values([
  { entityType: "device", entityId: id["doorbell-cam"], category: "history", body: "Initial scan found RTSP (554) and web UI (80) reachable from WAN via a stale port-forward. Removed forward, moved to IoT VLAN, egress restricted to vendor cloud + NTP + DNS." },
  { entityType: "device", entityId: id["doorbell-cam"], category: "reference", body: "Vendor advisory tracker: check firmware monthly. Currently on 3.1 — pending review against latest CVE list." },
  { entityType: "device", entityId: id["desktop-pc"], category: "history", body: "RDP (3389) enabled for LAN remote access. Confirm it is NOT forwarded at the firewall and only reachable from trusted VLAN. Prefer WireGuard instead." },
  { entityType: "device", entityId: id["nas-synology"], category: "reference", body: "Highest-value asset: family photos + documents. 3-2-1 backup: local + USB + encrypted offsite. Test-restore on the 1st of each month." },
  { entityType: "device", entityId: id["hp-printer"], category: "history", body: "Firmware is 2019 / end-of-life — vendor no longer ships updates. Flagged risk=medium. Candidate for replacement or strict egress block." },
  { entityType: "device", entityId: id["robovac"], category: "history", body: "EOL 2021, not seen in 45 days. Likely powered off. Keep on IoT VLAN; do not restore to trusted." },
  { entityType: "subnet", entityId: Z["iot"], category: "general", body: "IoT zone policy: internet-only, no LAN access. mDNS reflector allows trusted → iot for casting/printing only. Outbound SMTP blocked." },
  { entityType: "subnet", entityId: Z["mgmt"], category: "reference", body: "Management VLAN: admin reachable from trusted only. WireGuard on opnsense-fw is the single WAN-exposed service (udp/51820)." },
]);

console.log("Seed complete.");
process.exit(0);
