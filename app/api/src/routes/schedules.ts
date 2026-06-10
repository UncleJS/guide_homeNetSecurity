import { Elysia, t } from "elysia";
import { and, eq, isNull, desc, inArray, gte, lte } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  scanSchedules,
  scanRuns,
  subnets,
  devices,
  SCAN_RECURRENCES,
  SCAN_TARGET_TYPES,
} from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isDupError, affected } from "../lib/util.ts";
import { isValidPortSpec } from "../lib/scanner.ts";
import { advance, executeScheduleNow } from "../lib/scheduler.ts";
import { isSmtpConfigured, sendMail } from "../lib/mailer.ts";

const ScheduleBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  targetType: t.Union(SCAN_TARGET_TYPES.map((x) => t.Literal(x))),
  subnetId: t.Optional(t.Nullable(t.Integer())),
  deviceId: t.Optional(t.Nullable(t.Integer())),
  portSpec: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  recurrence: t.Optional(t.Union(SCAN_RECURRENCES.map((x) => t.Literal(x)))),
  nextRunAtUTC: t.String(), // ISO-8601 UTC
  enabled: t.Optional(t.Integer({ minimum: 0, maximum: 1 })),
  reminderMinutesBefore: t.Optional(t.Nullable(t.Integer({ minimum: 1, maximum: 10080 }))),
  reminderEmail: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  description: t.Optional(t.Nullable(t.String())),
});

const DUP_MESSAGE = "A schedule with that name already exists";

type ScheduleInput = Partial<typeof ScheduleBody.static>;

// Convert the ISO transport string into a Date for the datetime column.
function normalizeNextRun<T extends ScheduleInput>(body: T) {
  const { nextRunAtUTC, ...rest } = body;
  return {
    ...rest,
    ...(nextRunAtUTC !== undefined ? { nextRunAtUTC: new Date(nextRunAtUTC) } : {}),
  };
}

// Cross-field checks Elysia's schema can't express; returns a 422 message or null.
async function validateSchedule(input: ScheduleInput): Promise<string | null> {
  if (input.nextRunAtUTC !== undefined && Number.isNaN(Date.parse(input.nextRunAtUTC))) {
    return "nextRunAtUTC must be a valid ISO-8601 datetime";
  }
  if (input.portSpec !== undefined && !isValidPortSpec(input.portSpec)) {
    return "portSpec must be top100, top1000, or an nmap port list like 1-1024 or 22,80,443";
  }
  if (input.targetType === "subnet") {
    if (!input.subnetId) return "targetType subnet requires subnetId";
    if (input.deviceId) return "targetType subnet must not set deviceId";
    const [row] = await db.select({ id: subnets.id }).from(subnets)
      .where(and(eq(subnets.id, input.subnetId), isNull(subnets.archivedAtUTC)));
    if (!row) return "Referenced subnet does not exist (or is archived)";
  }
  if (input.targetType === "device") {
    if (!input.deviceId) return "targetType device requires deviceId";
    if (input.subnetId) return "targetType device must not set subnetId";
    const [row] = await db.select({ id: devices.id }).from(devices)
      .where(and(eq(devices.id, input.deviceId), isNull(devices.archivedAtUTC)));
    if (!row) return "Referenced device does not exist (or is archived)";
  }
  return null;
}

const MAX_CALENDAR_DAYS = 62;
const MAX_OCCURRENCES_PER_SCHEDULE = 100;
const MAX_OCCURRENCES_TOTAL = 500;

export const scheduleRoutes = new Elysia({ prefix: "/schedules", tags: ["Scan Schedules"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const where = query.includeArchived ? undefined : isNull(scanSchedules.archivedAtUTC);
    const rows = await db.select().from(scanSchedules)
      .where(where).orderBy(desc(scanSchedules.id)).limit(limit).offset(offset);
    // Latest run per schedule for the list view (one extra query, picked in JS).
    const ids = rows.map((r) => r.id);
    const lastRuns = new Map<number, { status: string; scheduledForUTC: Date }>();
    if (ids.length) {
      const runs = await db.select({
        scheduleId: scanRuns.scheduleId,
        status: scanRuns.status,
        scheduledForUTC: scanRuns.scheduledForUTC,
      }).from(scanRuns)
        .where(and(inArray(scanRuns.scheduleId, ids), isNull(scanRuns.archivedAtUTC)))
        .orderBy(desc(scanRuns.id));
      for (const r of runs) if (!lastRuns.has(r.scheduleId)) lastRuns.set(r.scheduleId, r);
    }
    return {
      page,
      pageSize,
      data: rows.map((r) => ({
        ...r,
        lastRunStatus: lastRuns.get(r.id)?.status ?? null,
        lastRunAtUTC: lastRuns.get(r.id)?.scheduledForUTC ?? null,
      })),
    };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
      includeArchived: t.Optional(t.Boolean()),
    }),
    detail: { summary: "List scan schedules (with latest run status)" },
  })
  .get("/calendar", async ({ query, status }) => {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return status(422, { message: "from/to must be valid ISO-8601 datetimes with from < to" });
    }
    if (to.getTime() - from.getTime() > MAX_CALENDAR_DAYS * 86_400_000) {
      return status(422, { message: "Calendar range must not exceed 62 days" });
    }
    // Past + in-progress occurrences: actual runs in range.
    const runs = await db.select({
      id: scanRuns.id,
      scheduleId: scanRuns.scheduleId,
      scheduleName: scanSchedules.name,
      scheduledForUTC: scanRuns.scheduledForUTC,
      status: scanRuns.status,
    }).from(scanRuns)
      .innerJoin(scanSchedules, eq(scanRuns.scheduleId, scanSchedules.id))
      .where(and(
        isNull(scanRuns.archivedAtUTC),
        gte(scanRuns.scheduledForUTC, from),
        lte(scanRuns.scheduledForUTC, to),
      ));
    // Future occurrences: expanded from each enabled schedule's cadence.
    const schedules = await db.select().from(scanSchedules).where(and(
      eq(scanSchedules.enabled, 1),
      isNull(scanSchedules.archivedAtUTC),
    ));
    const now = new Date();
    const occurrences: { scheduleId: number; scheduleName: string; atUTC: Date }[] = [];
    for (const s of schedules) {
      let occ = s.nextRunAtUTC;
      let count = 0;
      while (s.recurrence !== "once" && occ < from) occ = advance(occ, s.recurrence);
      while (occ <= to && count < MAX_OCCURRENCES_PER_SCHEDULE && occurrences.length < MAX_OCCURRENCES_TOTAL) {
        // Skip already-past occurrences — the due pass turns those into runs.
        if (occ >= from && occ >= now) {
          occurrences.push({ scheduleId: s.id, scheduleName: s.name, atUTC: occ });
          count++;
        }
        if (s.recurrence === "once") break;
        occ = advance(occ, s.recurrence);
      }
    }
    return { runs, occurrences };
  }, {
    query: t.Object({ from: t.String(), to: t.String() }),
    detail: { summary: "Calendar feed: runs + computed future occurrences in a date range" },
  })
  .post("/test-email", async ({ body, status }) => {
    if (!isSmtpConfigured()) return status(503, { message: "SMTP is not configured (set SMTP_HOST in .env)" });
    try {
      await sendMail({
        to: body.to,
        subject: "NetInventory test email",
        text: "SMTP is configured correctly — scan reminders will be delivered to this address.",
      });
      return { sent: true };
    } catch (e) {
      return status(502, { message: e instanceof Error ? e.message : "SMTP send failed" });
    }
  }, {
    body: t.Object({ to: t.String({ minLength: 3, maxLength: 255 }) }),
    detail: { summary: "Send a test email to verify SMTP settings" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(scanSchedules)
      .where(and(eq(scanSchedules.id, params.id), isNull(scanSchedules.archivedAtUTC)));
    if (!row) return status(404, { message: "Schedule not found" });
    const runs = await db.select().from(scanRuns)
      .where(and(eq(scanRuns.scheduleId, row.id), isNull(scanRuns.archivedAtUTC)))
      .orderBy(desc(scanRuns.scheduledForUTC)).limit(20);
    return { ...row, runs };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a schedule with its recent runs" } })
  .post("/", async ({ body, status }) => {
    const problem = await validateSchedule(body);
    if (problem) return status(422, { message: problem });
    try {
      const [{ id }] = await db.insert(scanSchedules).values(
        normalizeNextRun(body) as typeof scanSchedules.$inferInsert,
      ).$returningId();
      const [row] = await db.select().from(scanSchedules).where(eq(scanSchedules.id, id));
      return row;
    } catch (e) {
      if (isDupError(e)) return status(409, { message: DUP_MESSAGE });
      throw e;
    }
  }, { body: ScheduleBody, detail: { summary: "Create a scan schedule" } })
  .patch("/:id", async ({ params, body, status }) => {
    const [existing] = await db.select().from(scanSchedules)
      .where(and(eq(scanSchedules.id, params.id), isNull(scanSchedules.archivedAtUTC)));
    if (!existing) return status(404, { message: "Schedule not found" });
    // Validate the merged target so a partial PATCH can't break consistency.
    const merged: ScheduleInput = {
      ...body,
      targetType: body.targetType ?? existing.targetType,
      subnetId: body.subnetId !== undefined ? body.subnetId : existing.subnetId,
      deviceId: body.deviceId !== undefined ? body.deviceId : existing.deviceId,
    };
    const problem = await validateSchedule(merged);
    if (problem) return status(422, { message: problem });
    // Moving the occurrence (or cadence) invalidates the sent-reminder marker.
    const resetReminder = body.nextRunAtUTC !== undefined || body.recurrence !== undefined
      ? { reminderSentForUTC: null }
      : {};
    try {
      await db.update(scanSchedules)
        .set({ ...normalizeNextRun(body), ...resetReminder, ...touch() })
        .where(and(eq(scanSchedules.id, params.id), isNull(scanSchedules.archivedAtUTC)));
    } catch (e) {
      if (isDupError(e)) return status(409, { message: DUP_MESSAGE });
      throw e;
    }
    const [row] = await db.select().from(scanSchedules)
      .where(and(eq(scanSchedules.id, params.id), isNull(scanSchedules.archivedAtUTC)));
    return row ?? status(404, { message: "Schedule not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(ScheduleBody), detail: { summary: "Update a scan schedule" } })
  .post("/:id/run-now", async ({ params, status }) => {
    const result = await executeScheduleNow(params.id);
    if (result === null) return status(404, { message: "Schedule not found" });
    if (result === "busy") return status(409, { message: "A scan for this schedule is already running" });
    return result;
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Run a schedule's scan immediately (does not shift the cadence)" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(scanSchedules).set(archiveMark())
      .where(and(eq(scanSchedules.id, params.id), isNull(scanSchedules.archivedAtUTC)));
    if (!affected(res)) {
      const [row] = await db.select({ id: scanSchedules.id }).from(scanSchedules)
        .where(eq(scanSchedules.id, params.id));
      if (!row) return status(404, { message: "Schedule not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive (soft-delete) a schedule" } })
  .post("/:id/restore", async ({ params, status }) => {
    try {
      const res = await db.update(scanSchedules).set(restoreMark())
        .where(eq(scanSchedules.id, params.id));
      if (!affected(res)) return status(404, { message: "Schedule not found" });
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Cannot restore: name now conflicts with an active schedule" });
      throw e;
    }
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived schedule" } });
