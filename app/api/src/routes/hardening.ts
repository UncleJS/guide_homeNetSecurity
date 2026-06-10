import { Elysia, t } from "elysia";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { hardeningItems, HARDENING_STATES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isFkError, affected } from "../lib/util.ts";

const ItemBody = t.Object({
  deviceId: t.Integer(),
  control: t.String({ minLength: 1, maxLength: 200 }),
  state: t.Optional(t.Union(HARDENING_STATES.map((s) => t.Literal(s)))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const hardeningRoutes = new Elysia({ prefix: "/hardening-items", tags: ["Hardening"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [isNull(hardeningItems.archivedAtUTC)];
    if (query.deviceId) conds.push(eq(hardeningItems.deviceId, query.deviceId));
    const rows = await db.select().from(hardeningItems).where(and(...conds))
      .orderBy(hardeningItems.id).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      deviceId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List hardening checklist items" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(hardeningItems)
      .where(and(eq(hardeningItems.id, params.id), isNull(hardeningItems.archivedAtUTC)));
    return row ?? status(404, { message: "Item not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a hardening item" } })
  .post("/", async ({ body, status }) => {
    try {
      const [{ id }] = await db.insert(hardeningItems).values(body).$returningId();
      const [row] = await db.select().from(hardeningItems).where(eq(hardeningItems.id, id));
      return row;
    } catch (e) {
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
  }, { body: ItemBody, detail: { summary: "Add a hardening control to a device" } })
  .patch("/:id", async ({ params, body, status }) => {
    // When marking done, stamp completed_at_UTC; clear it otherwise.
    const completed = body.state === "done"
      ? { completedAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date }
      : body.state ? { completedAtUTC: null } : {};
    try {
      await db.update(hardeningItems)
        .set({ ...body, ...completed, ...touch() })
        .where(and(eq(hardeningItems.id, params.id), isNull(hardeningItems.archivedAtUTC)));
    } catch (e) {
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
    const [row] = await db.select().from(hardeningItems)
      .where(and(eq(hardeningItems.id, params.id), isNull(hardeningItems.archivedAtUTC)));
    return row ?? status(404, { message: "Item not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(ItemBody), detail: { summary: "Update a hardening item (toggle state)" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(hardeningItems).set(archiveMark()).where(and(eq(hardeningItems.id, params.id), isNull(hardeningItems.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: hardeningItems.id }).from(hardeningItems).where(eq(hardeningItems.id, params.id));
      if (!row) return status(404, { message: "Item not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a hardening item" } })
  .post("/:id/restore", async ({ params, status }) => {
    const res = await db.update(hardeningItems).set(restoreMark()).where(eq(hardeningItems.id, params.id));
    if (!affected(res)) return status(404, { message: "Item not found" });
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived hardening item" } });
