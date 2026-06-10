import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  devices, ipAddresses, devicePorts, hardeningItems, notes,
  RISK_LEVELS,
} from "../db/schema.ts";
import { DEFAULT_HARDENING_CONTROLS } from "../lib/hardening.ts";
import { touch, archiveMark, restoreMark, paginate, affected } from "../lib/util.ts";

const DeviceBody = t.Object({
  hostname: t.String({ minLength: 1, maxLength: 255 }),
  deviceType: t.Optional(t.Nullable(t.String({ maxLength: 60 }))),
  vendor: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  owner: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  location: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  firmwareVersion: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
  riskLevel: t.Optional(t.Union(RISK_LEVELS.map((r) => t.Literal(r)))),
  isGateway: t.Optional(t.Integer({ minimum: 0, maximum: 1 })),
  notes: t.Optional(t.Nullable(t.String())),
  posX: t.Optional(t.Nullable(t.Integer())),
  posY: t.Optional(t.Nullable(t.Integer())),
  // ISO-8601 UTC string, e.g. 2026-06-10T14:00:00Z
  lastSeenUTC: t.Optional(t.Nullable(t.String())),
});

function normalizeLastSeen<T extends { lastSeenUTC?: string | null }>(body: T) {
  const { lastSeenUTC, ...rest } = body;
  return {
    ...rest,
    ...(lastSeenUTC !== undefined
      ? { lastSeenUTC: lastSeenUTC ? new Date(lastSeenUTC) : null }
      : {}),
  };
}

export const deviceRoutes = new Elysia({ prefix: "/devices", tags: ["Devices"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [];
    if (!query.includeArchived) conds.push(isNull(devices.archivedAtUTC));
    if (query.riskLevel) conds.push(eq(devices.riskLevel, query.riskLevel));
    const rows = await db
      .select().from(devices)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(devices.id)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
      includeArchived: t.Optional(t.Boolean()),
      riskLevel: t.Optional(t.Union(RISK_LEVELS.map((r) => t.Literal(r)))),
    }),
    detail: { summary: "List devices" },
  })
  .get("/:id", async ({ params, status }) => {
    const [device] = await db.select().from(devices)
      .where(and(eq(devices.id, params.id), isNull(devices.archivedAtUTC)));
    if (!device) return status(404, { message: "Device not found" });
    const [ips, ports, hardening, deviceNotes] = await Promise.all([
      db.select().from(ipAddresses).where(and(eq(ipAddresses.deviceId, params.id), isNull(ipAddresses.archivedAtUTC))),
      db.select().from(devicePorts).where(and(eq(devicePorts.deviceId, params.id), isNull(devicePorts.archivedAtUTC))),
      db.select().from(hardeningItems).where(and(eq(hardeningItems.deviceId, params.id), isNull(hardeningItems.archivedAtUTC))),
      db.select().from(notes).where(and(eq(notes.entityType, "device"), eq(notes.entityId, params.id), isNull(notes.archivedAtUTC))).orderBy(desc(notes.createdAtUTC)),
    ]);
    return { ...device, ips, ports, hardening, notes: deviceNotes };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a device with its IPs, ports, hardening checklist, and notes" } })
  .post("/", async ({ body }) => {
    const [{ id }] = await db.insert(devices).values(normalizeLastSeen(body)).$returningId();
    // Seed the default hardening checklist for the new device.
    await db.insert(hardeningItems).values(
      DEFAULT_HARDENING_CONTROLS.map((control) => ({ deviceId: id, control })),
    );
    const [row] = await db.select().from(devices).where(eq(devices.id, id));
    return row;
  }, { body: DeviceBody, detail: { summary: "Create a device (seeds default hardening checklist)" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(devices).set({ ...normalizeLastSeen(body), ...touch() })
      .where(and(eq(devices.id, params.id), isNull(devices.archivedAtUTC)));
    const [row] = await db.select().from(devices)
      .where(and(eq(devices.id, params.id), isNull(devices.archivedAtUTC)));
    return row ?? status(404, { message: "Device not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(DeviceBody), detail: { summary: "Update a device" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(devices).set(archiveMark()).where(and(eq(devices.id, params.id), isNull(devices.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: devices.id }).from(devices).where(eq(devices.id, params.id));
      if (!row) return status(404, { message: "Device not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a device" } })
  .post("/:id/restore", async ({ params, status }) => {
    const res = await db.update(devices).set(restoreMark()).where(eq(devices.id, params.id));
    if (!affected(res)) return status(404, { message: "Device not found" });
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a device" } });
