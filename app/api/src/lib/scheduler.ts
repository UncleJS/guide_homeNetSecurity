// In-process scan scheduler: executes due scan_schedules with nmap and sends
// SMTP reminders ahead of upcoming runs. Started ONLY from index.ts so route
// tests (which import app.ts) never spin up the interval. A single API
// process runs at a time, so an in-memory Set is a sufficient overlap guard.
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { scanSchedules, scanRuns, scanFindings, subnets, ipAddresses } from "../db/schema.ts";
import { touch } from "./util.ts";
import { buildNmapArgs, parseGrepable, runNmap, type ScanFinding } from "./scanner.ts";
import { isSmtpConfigured, sendMail } from "./mailer.ts";

type Schedule = typeof scanSchedules.$inferSelect;
type Recurrence = Schedule["recurrence"];

const running = new Set<number>();
let smtpWarned = false;

// Next occurrence after `date` for a recurrence, in UTC. Monthly/quarterly
// clamp the day-of-month (Jan 31 -> Feb 28/29) instead of rolling over.
export function advance(date: Date, recurrence: Recurrence): Date {
  const d = new Date(date.getTime());
  switch (recurrence) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "monthly":
      return addMonthsClamped(d, 1);
    case "quarterly":
      return addMonthsClamped(d, 3);
    default:
      return d; // "once" — caller disables instead of advancing
  }
}

function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m, Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  ));
}

export function startScheduler() {
  const interval = Number(process.env.SCHEDULER_INTERVAL_MS ?? 30_000);
  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), interval);
  console.log(`Scan scheduler started (tick every ${interval}ms)`);
}

async function tick() {
  try {
    await duePass();
    await reminderPass();
  } catch (e) {
    console.error("scheduler tick failed:", e);
  }
}

async function duePass() {
  const due = await db.select().from(scanSchedules).where(and(
    eq(scanSchedules.enabled, 1),
    isNull(scanSchedules.archivedAtUTC),
    lte(scanSchedules.nextRunAtUTC, new Date()),
  ));
  await Promise.allSettled(
    due.filter((s) => !running.has(s.id)).map((s) => executeSchedule(s)),
  );
}

async function reminderPass() {
  const upcoming = await db.select().from(scanSchedules).where(and(
    eq(scanSchedules.enabled, 1),
    isNull(scanSchedules.archivedAtUTC),
    sql`${scanSchedules.reminderMinutesBefore} IS NOT NULL`,
    sql`${scanSchedules.reminderEmail} IS NOT NULL`,
    sql`${scanSchedules.nextRunAtUTC} > UTC_TIMESTAMP()`,
    sql`${scanSchedules.nextRunAtUTC} <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${scanSchedules.reminderMinutesBefore} MINUTE)`,
    sql`(${scanSchedules.reminderSentForUTC} IS NULL OR ${scanSchedules.reminderSentForUTC} <> ${scanSchedules.nextRunAtUTC})`,
  ));
  if (!upcoming.length) return;
  if (!isSmtpConfigured()) {
    if (!smtpWarned) {
      console.warn("Reminders due but SMTP is not configured (SMTP_HOST empty) — skipping");
      smtpWarned = true;
    }
    return;
  }
  for (const s of upcoming) {
    try {
      await sendMail({
        to: s.reminderEmail!,
        subject: `Scan reminder: ${s.name}`,
        text: [
          `The scheduled scan "${s.name}" is due at ${formatUTC(s.nextRunAtUTC)} UTC.`,
          ``,
          `Target: ${s.targetType} #${s.targetType === "subnet" ? s.subnetId : s.deviceId}`,
          `Ports: ${s.portSpec}`,
          `Recurrence: ${s.recurrence}`,
        ].join("\n"),
      });
      // Mark this occurrence as reminded; survives restarts.
      await db.update(scanSchedules)
        .set({ reminderSentForUTC: s.nextRunAtUTC, ...touch() })
        .where(eq(scanSchedules.id, s.id));
    } catch (e) {
      console.error(`reminder send failed for schedule ${s.id}:`, e);
      // No marker set — retried on the next tick.
    }
  }
}

function formatUTC(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Resolve scan targets; throws a user-readable error when unresolvable.
async function resolveTargets(s: Schedule): Promise<{ targets: string[]; singleHost: boolean }> {
  if (s.targetType === "subnet") {
    if (!s.subnetId) throw new Error("Schedule has no subnet assigned");
    const [subnet] = await db.select().from(subnets)
      .where(and(eq(subnets.id, s.subnetId), isNull(subnets.archivedAtUTC)));
    if (!subnet) throw new Error("Target subnet is missing or archived");
    return { targets: [subnet.cidr], singleHost: false };
  }
  if (!s.deviceId) throw new Error("Schedule has no device assigned");
  const ips = await db.select().from(ipAddresses)
    .where(and(eq(ipAddresses.deviceId, s.deviceId), isNull(ipAddresses.archivedAtUTC)));
  if (!ips.length) throw new Error("Target device has no active IP addresses");
  // The same address may be allocated under several subnets; nmap scans each
  // CLI target separately, so duplicates would double every finding.
  return { targets: [...new Set(ips.map((ip) => ip.address))], singleHost: true };
}

// Run the scan for an existing scan_runs row and finalize its status.
async function performScan(s: Schedule, runId: number) {
  try {
    const { targets, singleHost } = await resolveTargets(s);
    const stdout = await runNmap(buildNmapArgs(targets, s.portSpec, singleHost));
    const { hostsUp, findings } = parseGrepable(stdout);
    await insertFindings(runId, findings);
    await db.update(scanRuns).set({
      status: "completed",
      finishedAtUTC: new Date(),
      hostsScanned: hostsUp,
      openPorts: findings.length,
      ...touch(),
    }).where(eq(scanRuns.id, runId));
  } catch (e) {
    await db.update(scanRuns).set({
      status: "failed",
      finishedAtUTC: new Date(),
      error: e instanceof Error ? e.message : String(e),
      ...touch(),
    }).where(eq(scanRuns.id, runId));
  }
}

async function insertFindings(runId: number, findings: ScanFinding[]) {
  for (let i = 0; i < findings.length; i += 200) {
    await db.insert(scanFindings).values(
      findings.slice(i, i + 200).map((f) => ({ runId, ...f })),
    );
  }
}

// Scheduled execution: create the run, scan, then advance the cadence.
async function executeSchedule(s: Schedule) {
  running.add(s.id);
  try {
    const scheduledFor = s.nextRunAtUTC;
    const [{ id: runId }] = await db.insert(scanRuns).values({
      scheduleId: s.id,
      scheduledForUTC: scheduledFor,
      startedAtUTC: new Date(),
      status: "running",
    }).$returningId();

    await performScan(s, runId);

    if (s.recurrence === "once") {
      await db.update(scanSchedules).set({ enabled: 0, ...touch() })
        .where(eq(scanSchedules.id, s.id));
    } else {
      // Catch-up after downtime: one run per missed window, no run storm.
      const now = new Date();
      let next = scheduledFor;
      do {
        next = advance(next, s.recurrence);
      } while (next <= now);
      // Optimistic guard: only advance if no concurrent PATCH moved the schedule.
      await db.update(scanSchedules)
        .set({ nextRunAtUTC: next, reminderSentForUTC: null, ...touch() })
        .where(and(
          eq(scanSchedules.id, s.id),
          eq(scanSchedules.nextRunAtUTC, scheduledFor),
        ));
    }
  } catch (e) {
    console.error(`scheduled scan failed for schedule ${s.id}:`, e);
  } finally {
    running.delete(s.id);
  }
}

// Manual "run now": creates a run immediately WITHOUT advancing the cadence.
// Returns null (missing), "busy" (already running), or the new run row.
export async function executeScheduleNow(id: number) {
  const [s] = await db.select().from(scanSchedules)
    .where(and(eq(scanSchedules.id, id), isNull(scanSchedules.archivedAtUTC)));
  if (!s) return null;
  if (running.has(s.id)) return "busy" as const;

  running.add(s.id);
  const [{ id: runId }] = await db.insert(scanRuns).values({
    scheduleId: s.id,
    scheduledForUTC: new Date(),
    startedAtUTC: new Date(),
    status: "running",
  }).$returningId();
  // Fire and forget — the client polls GET /scan-runs/:id for completion.
  void performScan(s, runId).finally(() => running.delete(s.id));
  const [run] = await db.select().from(scanRuns).where(eq(scanRuns.id, runId));
  return run;
}
