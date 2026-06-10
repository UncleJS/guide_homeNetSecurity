import { Elysia, t } from "elysia";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { hardeningItems, HARDENING_STATES } from "../db/schema.ts";
import { touch, archiveMark } from "../lib/util.ts";

const ItemBody = t.Object({
  deviceId: t.Integer(),
  control: t.String({ minLength: 1, maxLength: 200 }),
  state: t.Optional(t.Union(HARDENING_STATES.map((s) => t.Literal(s)))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const hardeningRoutes = new Elysia({ prefix: "/hardening-items", tags: ["Hardening"] })
  .get("/", async ({ query }) => {
    const conds = [isNull(hardeningItems.archivedAtUTC)];
    if (query.deviceId) conds.push(eq(hardeningItems.deviceId, query.deviceId));
    return db.select().from(hardeningItems).where(and(...conds)).orderBy(hardeningItems.id);
  }, { query: t.Object({ deviceId: t.Optional(t.Numeric()) }), detail: { summary: "List hardening checklist items" } })
  .post("/", async ({ body }) => {
    const [{ id }] = await db.insert(hardeningItems).values(body).$returningId();
    const [row] = await db.select().from(hardeningItems).where(eq(hardeningItems.id, id));
    return row;
  }, { body: ItemBody, detail: { summary: "Add a hardening control to a device" } })
  .patch("/:id", async ({ params, body, status }) => {
    // When marking done, stamp completed_at_UTC; clear it otherwise.
    const completed = body.state === "done"
      ? { completedAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date }
      : body.state ? { completedAtUTC: null } : {};
    await db.update(hardeningItems)
      .set({ ...body, ...completed, ...touch() })
      .where(eq(hardeningItems.id, params.id));
    const [row] = await db.select().from(hardeningItems).where(eq(hardeningItems.id, params.id));
    return row ?? status(404, { message: "Item not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(ItemBody), detail: { summary: "Update a hardening item (toggle state)" } })
  .post("/:id/archive", async ({ params }) => {
    await db.update(hardeningItems).set(archiveMark()).where(and(eq(hardeningItems.id, params.id), isNull(hardeningItems.archivedAtUTC)));
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a hardening item" } });
