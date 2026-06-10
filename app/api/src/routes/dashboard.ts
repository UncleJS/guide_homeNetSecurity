import { Elysia } from "elysia";
import { isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devices, subnets, ipAddresses, hardeningItems } from "../db/schema.ts";
import { ipv4Capacity } from "../lib/net.ts";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard", tags: ["Dashboard"] })
  .get("/summary", async () => {
    const [devs, subs, ips, hardening] = await Promise.all([
      db.select().from(devices).where(isNull(devices.archivedAtUTC)),
      db.select().from(subnets).where(isNull(subnets.archivedAtUTC)),
      db.select().from(ipAddresses).where(isNull(ipAddresses.archivedAtUTC)),
      db.select().from(hardeningItems).where(isNull(hardeningItems.archivedAtUTC)),
    ]);

    // IP usage per subnet
    const usedBySubnet = new Map<number, number>();
    for (const ip of ips) usedBySubnet.set(ip.subnetId, (usedBySubnet.get(ip.subnetId) ?? 0) + 1);

    const subnetUtilization = subs.map((s) => {
      const capacity = ipv4Capacity(s.cidr);
      const used = usedBySubnet.get(s.id) ?? 0;
      return {
        subnetId: s.id, name: s.name, cidr: s.cidr, zone: s.trustZone,
        used, capacity, percent: capacity ? Math.round((used / capacity) * 100) : null,
      };
    });

    // Devices grouped by trust zone (via primary subnet of their IPs)
    const zoneBySubnet = new Map(subs.map((s) => [s.id, s.trustZone]));
    const deviceZone = new Map<number, string>();
    for (const ip of ips) {
      if (ip.deviceId && !deviceZone.has(ip.deviceId)) {
        deviceZone.set(ip.deviceId, zoneBySubnet.get(ip.subnetId) ?? "unassigned");
      }
    }
    const zoneCounts: Record<string, number> = {};
    for (const d of devs) {
      const z = deviceZone.get(d.id) ?? "unassigned";
      zoneCounts[z] = (zoneCounts[z] ?? 0) + 1;
    }

    // Risk counts
    const riskCounts: Record<string, number> = {};
    for (const d of devs) riskCounts[d.riskLevel] = (riskCounts[d.riskLevel] ?? 0) + 1;

    // Hardening completion
    const total = hardening.length;
    const done = hardening.filter((h) => h.state === "done").length;
    const na = hardening.filter((h) => h.state === "na").length;
    const applicable = total - na;
    const hardeningPercent = applicable > 0 ? Math.round((done / applicable) * 100) : 100;

    // Stale devices: never seen, or last seen > 30 days ago
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const stale = devs
      .filter((d) => !d.lastSeenUTC || now - new Date(d.lastSeenUTC).getTime() > THIRTY_DAYS)
      .map((d) => ({ id: d.id, hostname: d.hostname, lastSeenUTC: d.lastSeenUTC, riskLevel: d.riskLevel }));

    return {
      totals: { devices: devs.length, subnets: subs.length, ipAddresses: ips.length },
      zoneCounts,
      riskCounts,
      highRiskCount: (riskCounts.high ?? 0) + (riskCounts.critical ?? 0),
      subnetUtilization,
      hardening: { total, done, na, applicable, percent: hardeningPercent },
      staleDevices: stale,
    };
  }, { detail: { summary: "Dashboard summary: zones, risk, IP utilization, hardening %, stale devices" } });
