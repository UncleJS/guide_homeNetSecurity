import { Elysia, t } from "elysia";
import { and, eq, isNull, or, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devicePorts, ipAddresses } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isFkError, isDupError, affected } from "../lib/util.ts";

// 422 message when the IP binding is invalid; null when valid. The FK alone
// cannot enforce that the address belongs to the port's device.
async function ipDeviceMismatch(ipAddressId: number, deviceId: number): Promise<string | null> {
  const [ip] = await db.select({ deviceId: ipAddresses.deviceId }).from(ipAddresses)
    .where(and(eq(ipAddresses.id, ipAddressId), isNull(ipAddresses.archivedAtUTC)));
  if (!ip) return "Referenced IP address does not exist";
  if (ip.deviceId !== deviceId) return "IP address is not assigned to this device";
  return null;
}

const PortBody = t.Object({
  deviceId: t.Integer(),
  ipAddressId: t.Optional(t.Nullable(t.Integer())),
  port: t.Integer({ minimum: 0, maximum: 65535 }),
  protocol: t.Optional(t.String({ maxLength: 8 })),
  service: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const portRoutes = new Elysia({ prefix: "/device-ports", tags: ["Device Ports"] })
  .get("/", async ({ query, status }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [isNull(devicePorts.archivedAtUTC)];
    if (query.deviceId) conds.push(eq(devicePorts.deviceId, query.deviceId));
    if (query.ipAddressId) {
      if (query.includeDeviceWide) {
        // Without a device scope, NULL-ip rows from every device would leak in.
        if (!query.deviceId) return status(422, { message: "includeDeviceWide requires deviceId" });
        conds.push(or(
          eq(devicePorts.ipAddressId, query.ipAddressId),
          isNull(devicePorts.ipAddressId),
        )!);
      } else {
        conds.push(eq(devicePorts.ipAddressId, query.ipAddressId));
      }
    }
    const rows = await db.select().from(devicePorts).where(and(...conds))
      .orderBy(desc(devicePorts.id)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      deviceId: t.Optional(t.Numeric()),
      ipAddressId: t.Optional(t.Numeric()),
      includeDeviceWide: t.Optional(t.Boolean()),
    }),
    detail: { summary: "List device ports/services" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(devicePorts)
      .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    return row ?? status(404, { message: "Port not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a port/service" } })
  .post("/", async ({ body, status }) => {
    if (body.ipAddressId != null) {
      const mismatch = await ipDeviceMismatch(body.ipAddressId, body.deviceId);
      if (mismatch) return status(422, { message: mismatch });
    }
    try {
      const [{ id }] = await db.insert(devicePorts).values(body).$returningId();
      const [row] = await db.select().from(devicePorts).where(eq(devicePorts.id, id));
      return row;
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Port already exists on this device/IP" });
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
  }, { body: PortBody, detail: { summary: "Record an open port/service" } })
  .patch("/:id", async ({ params, body, status }) => {
    if (body.ipAddressId !== undefined || body.deviceId !== undefined) {
      const [current] = await db.select().from(devicePorts)
        .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
      if (!current) return status(404, { message: "Port not found" });
      const effectiveIp = body.ipAddressId === undefined ? current.ipAddressId : body.ipAddressId;
      const effectiveDevice = body.deviceId ?? current.deviceId;
      if (effectiveIp != null) {
        const mismatch = await ipDeviceMismatch(effectiveIp, effectiveDevice);
        if (mismatch) return status(422, { message: mismatch });
      }
    }
    try {
      await db.update(devicePorts).set({ ...body, ...touch() })
        .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Port already exists on this device/IP" });
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
    const [row] = await db.select().from(devicePorts)
      .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    return row ?? status(404, { message: "Port not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(PortBody), detail: { summary: "Update a port/service" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(devicePorts).set(archiveMark()).where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: devicePorts.id }).from(devicePorts).where(eq(devicePorts.id, params.id));
      if (!row) return status(404, { message: "Port not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a port/service" } })
  .post("/:id/restore", async ({ params, status }) => {
    try {
      const res = await db.update(devicePorts).set(restoreMark()).where(eq(devicePorts.id, params.id));
      if (!affected(res)) return status(404, { message: "Port not found" });
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Cannot restore: port now conflicts with an active port on this device" });
      throw e;
    }
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a port/service" } });
