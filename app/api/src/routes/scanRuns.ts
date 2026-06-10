import { Elysia, t } from "elysia";
import { and, eq, isNull, desc, asc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { scanRuns, scanFindings, scanSchedules } from "../db/schema.ts";
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
