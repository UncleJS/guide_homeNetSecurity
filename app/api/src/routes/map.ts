import { Elysia } from "elysia";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devices, ipAddresses, subnets, links } from "../db/schema.ts";

// Builds a renderer-agnostic { nodes, edges } graph:
//  - auto-derived tree: Internet -> gateway device(s) -> other devices
//  - merged with explicit LINKS rows (deduped against auto edges)
export const mapRoutes = new Elysia({ prefix: "/map", tags: ["Network Map"] })
  .get("/graph", async () => {
    const [dev, ips, subs, lnk] = await Promise.all([
      db.select().from(devices).where(isNull(devices.archivedAtUTC)),
      db.select().from(ipAddresses).where(isNull(ipAddresses.archivedAtUTC)),
      db.select().from(subnets).where(isNull(subnets.archivedAtUTC)),
      db.select().from(links).where(isNull(links.archivedAtUTC)),
    ]);

    const zoneBySubnet = new Map(subs.map((s) => [s.id, s.trustZone]));
    // First active IP per device gives its primary address + zone.
    const primaryIp = new Map<number, { address: string; zone: string }>();
    for (const ip of ips) {
      if (ip.deviceId && !primaryIp.has(ip.deviceId)) {
        primaryIp.set(ip.deviceId, {
          address: ip.address,
          zone: (ip.subnetId && zoneBySubnet.get(ip.subnetId)) || "trusted",
        });
      }
    }

    const nodes = [
      { id: "internet", type: "internet", label: "Internet", zone: "wan", risk: null },
      ...dev.map((d) => ({
        id: `d${d.id}`,
        type: "device",
        deviceId: d.id,
        label: d.hostname,
        deviceType: d.deviceType,
        zone: primaryIp.get(d.id)?.zone ?? "unassigned",
        ip: primaryIp.get(d.id)?.address ?? null,
        risk: d.riskLevel,
        isGateway: d.isGateway === 1,
        posX: d.posX,
        posY: d.posY,
      })),
    ];

    const edges: Array<Record<string, unknown>> = [];
    const pairSeen = new Set<string>();
    const key = (a: string, b: string) => [a, b].sort().join("|");

    // Explicit links first (they win over auto edges).
    // Track every device that already has an explicit uplink so we don't ALSO
    // fan it out to the gateway — it's already placed in the topology.
    const linkedDevices = new Set<string>();
    for (const l of lnk) {
      const s = `d${l.sourceDeviceId}`;
      const t = `d${l.targetDeviceId}`;
      edges.push({ id: `l${l.id}`, source: s, target: t, type: l.linkType, label: l.label, explicit: true });
      pairSeen.add(key(s, t));
      linkedDevices.add(s);
      linkedDevices.add(t);
    }

    const gateways = dev.filter((d) => d.isGateway === 1);
    // Internet -> gateways (or -> everything if no gateway is defined yet)
    if (gateways.length) {
      for (const g of gateways) {
        const t = `d${g.id}`;
        if (!pairSeen.has(key("internet", t))) {
          edges.push({ id: `auto-wan-${g.id}`, source: "internet", target: t, type: "auto", explicit: false });
          pairSeen.add(key("internet", t));
        }
      }
      // Orphan devices (no explicit uplink) -> a gateway (same zone if available,
      // else the first). Devices already attached via an explicit link are skipped.
      for (const d of dev) {
        if (d.isGateway === 1) continue;
        const t = `d${d.id}`;
        if (linkedDevices.has(t)) continue;
        const zone = primaryIp.get(d.id)?.zone;
        const g = gateways.find((gw) => primaryIp.get(gw.id)?.zone === zone) ?? gateways[0];
        const s = `d${g.id}`;
        if (s !== t && !pairSeen.has(key(s, t))) {
          edges.push({ id: `auto-${g.id}-${d.id}`, source: s, target: t, type: "auto", explicit: false });
          pairSeen.add(key(s, t));
        }
      }
    } else {
      for (const d of dev) {
        const t = `d${d.id}`;
        if (!pairSeen.has(key("internet", t))) {
          edges.push({ id: `auto-wan-${d.id}`, source: "internet", target: t, type: "auto", explicit: false });
        }
      }
    }

    return { nodes, edges };
  }, { detail: { summary: "Network topology graph (auto-derived + explicit links)" } });
