import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devicePorts } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isFkError, isDupError, affected } from "../lib/util.ts";

const PortBody = t.Object({
  deviceId: t.Integer(),
  port: t.Integer({ minimum: 0, maximum: 65535 }),
  protocol: t.Optional(t.String({ maxLength: 8 })),
  service: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const portRoutes = new Elysia({ prefix: "/device-ports", tags: ["Device Ports"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [isNull(devicePorts.archivedAtUTC)];
    if (query.deviceId) conds.push(eq(devicePorts.deviceId, query.deviceId));
    const rows = await db.select().from(devicePorts).where(and(...conds))
      .orderBy(desc(devicePorts.id)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      deviceId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List device ports/services" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(devicePorts)
      .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    return row ?? status(404, { message: "Port not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a port/service" } })
  .post("/", async ({ body, status }) => {
    try {
      const [{ id }] = await db.insert(devicePorts).values(body).$returningId();
      const [row] = await db.select().from(devicePorts).where(eq(devicePorts.id, id));
      return row;
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Port already exists on this device" });
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
  }, { body: PortBody, detail: { summary: "Record an open port/service" } })
  .patch("/:id", async ({ params, body, status }) => {
    try {
      await db.update(devicePorts).set({ ...body, ...touch() })
        .where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Port already exists on this device" });
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
