import { Elysia, t } from "elysia";
import { and, eq, isNull, desc, asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { scanRuns, scanFindings, scanSchedules, ipAddresses, devicePorts } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, affected } from "../lib/util.ts";

export const scanRunRoutes = new Elysia({ prefix: "/scan-runs", tags: ["Scan Runs"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [];
    if (!query.includeArchived) conds.push(isNull(scanRuns.archivedAtUTC));
    if (query.scheduleId) conds.push(eq(scanRuns.scheduleId, query.scheduleId));
    const rows = await db.select({
      id: scanRuns.id,
      scheduleId: scanRuns.scheduleId,
      scheduleName: scanSchedules.name,
      scheduledForUTC: scanRuns.scheduledForUTC,
      startedAtUTC: scanRuns.startedAtUTC,
      finishedAtUTC: scanRuns.finishedAtUTC,
      status: scanRuns.status,
      hostsScanned: scanRuns.hostsScanned,
      openPorts: scanRuns.openPorts,
      error: scanRuns.error,
      archivedAtUTC: scanRuns.archivedAtUTC,
    }).from(scanRuns)
      .innerJoin(scanSchedules, eq(scanRuns.scheduleId, scanSchedules.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(scanRuns.scheduledForUTC))
      .limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
      includeArchived: t.Optional(t.Boolean()),
      scheduleId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List scan runs (optionally for one schedule)" },
  })
  .get("/:id", async ({ params, status }) => {
    const [run] = await db.select().from(scanRuns)
      .where(and(eq(scanRuns.id, params.id), isNull(scanRuns.archivedAtUTC)));
    if (!run) return status(404, { message: "Scan run not found" });
    const [schedule] = await db.select({ name: scanSchedules.name }).from(scanSchedules)
      .where(eq(scanSchedules.id, run.scheduleId));
    const findings = await db.select().from(scanFindings)
      .where(and(eq(scanFindings.runId, run.id), isNull(scanFindings.archivedAtUTC)))
      .orderBy(asc(scanFindings.ipAddress), asc(scanFindings.port));
    return { ...run, scheduleName: schedule?.name ?? null, findings };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a scan run with its findings" } })
  .patch("/:id/findings/:findingId", async ({ params, body, status }) => {
    const [finding] = await db.select().from(scanFindings).where(and(
      eq(scanFindings.id, params.findingId),
      eq(scanFindings.runId, params.id),
      isNull(scanFindings.archivedAtUTC),
    ));
    if (!finding) return status(404, { message: "Finding not found" });
    await db.update(scanFindings).set({ notes: body.notes, ...touch() })
      .where(eq(scanFindings.id, finding.id));
    const [row] = await db.select().from(scanFindings).where(eq(scanFindings.id, finding.id));
    return row;
  }, {
    params: t.Object({ id: t.Numeric(), findingId: t.Numeric() }),
    body: t.Object({ notes: t.Nullable(t.String()) }),
    detail: { summary: "Annotate a finding (analyst notes)" },
  })
  .post("/:id/import-findings", async ({ params, body, status }) => {
    const [run] = await db.select({ id: scanRuns.id }).from(scanRuns)
      .where(and(eq(scanRuns.id, params.id), isNull(scanRuns.archivedAtUTC)));
    if (!run) return status(404, { message: "Scan run not found" });

    const requestedIds = [...new Set(body.findingIds ?? [])];
    const conds = [eq(scanFindings.runId, run.id), isNull(scanFindings.archivedAtUTC)];
    if (requestedIds.length) conds.push(inArray(scanFindings.id, requestedIds));
    const findings = await db.select().from(scanFindings).where(and(...conds));
    if (requestedIds.length && findings.length !== requestedIds.length)
      return status(404, { message: "Finding not found" });

    const open = findings.filter((f) => f.state === "open");
    const skippedState = findings.length - open.length;

    // Resolve each finding IP to exactly one active device; 0 or >1 matches → unmatched.
    const ips = [...new Set(open.map((f) => f.ipAddress))];
    const ipRows = ips.length
      ? await db.select({ address: ipAddresses.address, deviceId: ipAddresses.deviceId })
          .from(ipAddresses)
          .where(and(inArray(ipAddresses.address, ips), isNull(ipAddresses.archivedAtUTC)))
      : [];
    const devicesByIp = new Map<string, Set<number>>();
    for (const r of ipRows) {
      if (r.deviceId == null) continue;
      const set = devicesByIp.get(r.address) ?? new Set<number>();
      set.add(r.deviceId);
      devicesByIp.set(r.address, set);
    }
    const deviceForIp = new Map<string, number>();
    const unmatched = new Set<string>();
    for (const ip of ips) {
      const set = devicesByIp.get(ip);
      if (set?.size === 1) deviceForIp.set(ip, [...set][0]!);
      else unmatched.add(ip);
    }

    const deviceIds = [...new Set(deviceForIp.values())];
    const activePortIds = new Map<string, number>(); // "deviceId:port:protocol" -> devicePorts.id
    if (deviceIds.length) {
      const rows = await db.select({
        id: devicePorts.id,
        deviceId: devicePorts.deviceId,
        port: devicePorts.port,
        protocol: devicePorts.protocol,
      }).from(devicePorts)
        .where(and(inArray(devicePorts.deviceId, deviceIds), isNull(devicePorts.archivedAtUTC)));
      for (const p of rows) activePortIds.set(`${p.deviceId}:${p.port}:${p.protocol}`, p.id);
    }

    let imported = 0;
    let updated = 0;
    for (const f of open) {
      const deviceId = deviceForIp.get(f.ipAddress);
      if (deviceId === undefined) continue;
      const key = `${deviceId}:${f.port}:${f.protocol}`;
      const existingId = activePortIds.get(key);
      if (existingId !== undefined) {
        // Re-seen: bump last-seen; only overwrite service when the scan identified one.
        await db.update(devicePorts).set({
          ...(f.service ? { service: f.service } : {}),
          lastSeenAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date,
          ...touch(),
        }).where(eq(devicePorts.id, existingId));
        updated++;
      } else {
        const [{ id }] = await db.insert(devicePorts).values({
          deviceId,
          port: f.port,
          protocol: f.protocol,
          service: f.service,
          source: "scan",
          lastSeenAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date,
        }).$returningId();
        activePortIds.set(key, id);
        imported++;
      }
    }
    return { imported, updated, skippedState, skippedUnmatched: [...unmatched].sort() };
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({ findingIds: t.Optional(t.Array(t.Integer())) }),
    detail: { summary: "Import open-port findings onto registered devices" },
  })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(scanRuns).set(archiveMark())
      .where(and(eq(scanRuns.id, params.id), isNull(scanRuns.archivedAtUTC)));
    if (!affected(res)) {
      const [row] = await db.select({ id: scanRuns.id }).from(scanRuns)
        .where(eq(scanRuns.id, params.id));
      if (!row) return status(404, { message: "Scan run not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive (soft-delete) a scan run" } })
  .post("/:id/restore", async ({ params, status }) => {
    const res = await db.update(scanRuns).set(restoreMark()).where(eq(scanRuns.id, params.id));
    if (!affected(res)) return status(404, { message: "Scan run not found" });
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived scan run" } });
