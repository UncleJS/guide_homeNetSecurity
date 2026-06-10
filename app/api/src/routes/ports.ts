import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devicePorts } from "../db/schema.ts";
import { touch, archiveMark, restoreMark } from "../lib/util.ts";

const PortBody = t.Object({
  deviceId: t.Integer(),
  port: t.Integer({ minimum: 0, maximum: 65535 }),
  protocol: t.Optional(t.String({ maxLength: 8 })),
  service: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const portRoutes = new Elysia({ prefix: "/device-ports", tags: ["Device Ports"] })
  .get("/", async ({ query }) => {
    const conds = [isNull(devicePorts.archivedAtUTC)];
    if (query.deviceId) conds.push(eq(devicePorts.deviceId, query.deviceId));
    return db.select().from(devicePorts).where(and(...conds)).orderBy(desc(devicePorts.id));
  }, { query: t.Object({ deviceId: t.Optional(t.Numeric()) }), detail: { summary: "List device ports/services" } })
  .post("/", async ({ body }) => {
    const [{ id }] = await db.insert(devicePorts).values(body).$returningId();
    const [row] = await db.select().from(devicePorts).where(eq(devicePorts.id, id));
    return row;
  }, { body: PortBody, detail: { summary: "Record an open port/service" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(devicePorts).set({ ...body, ...touch() }).where(eq(devicePorts.id, params.id));
    const [row] = await db.select().from(devicePorts).where(eq(devicePorts.id, params.id));
    return row ?? status(404, { message: "Port not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(PortBody), detail: { summary: "Update a port/service" } })
  .post("/:id/archive", async ({ params }) => {
    await db.update(devicePorts).set(archiveMark()).where(and(eq(devicePorts.id, params.id), isNull(devicePorts.archivedAtUTC)));
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a port/service" } })
  .post("/:id/restore", async ({ params }) => {
    await db.update(devicePorts).set(restoreMark()).where(eq(devicePorts.id, params.id));
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a port/service" } });
