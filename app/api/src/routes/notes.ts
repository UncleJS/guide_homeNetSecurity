import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { notes, subnets, devices, ipAddresses, NOTE_CATEGORIES, NOTE_ENTITIES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, affected } from "../lib/util.ts";

const NoteBody = t.Object({
  entityType: t.Union(NOTE_ENTITIES.map((e) => t.Literal(e))),
  entityId: t.Integer(),
  category: t.Optional(t.Union(NOTE_CATEGORIES.map((c) => t.Literal(c)))),
  body: t.String({ minLength: 1 }),
  author: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
});

// notes is polymorphic (entity_type + entity_id), so no DB-level FK is possible;
// verify the target exists and is active before inserting.
async function entityExists(entityType: (typeof NOTE_ENTITIES)[number], entityId: number) {
  switch (entityType) {
    case "subnet": {
      const [row] = await db.select({ id: subnets.id }).from(subnets)
        .where(and(eq(subnets.id, entityId), isNull(subnets.archivedAtUTC)));
      return Boolean(row);
    }
    case "device": {
      const [row] = await db.select({ id: devices.id }).from(devices)
        .where(and(eq(devices.id, entityId), isNull(devices.archivedAtUTC)));
      return Boolean(row);
    }
    case "ip_address": {
      const [row] = await db.select({ id: ipAddresses.id }).from(ipAddresses)
        .where(and(eq(ipAddresses.id, entityId), isNull(ipAddresses.archivedAtUTC)));
      return Boolean(row);
    }
  }
}

export const noteRoutes = new Elysia({ prefix: "/notes", tags: ["Notes"] })
  .get("/", async ({ query }) => {
    // Notes/history for an item, newest first.
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [isNull(notes.archivedAtUTC)];
    if (query.entityType) conds.push(eq(notes.entityType, query.entityType));
    if (query.entityId) conds.push(eq(notes.entityId, query.entityId));
    const rows = await db.select().from(notes).where(and(...conds))
      .orderBy(desc(notes.createdAtUTC)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      entityType: t.Optional(t.Union(NOTE_ENTITIES.map((e) => t.Literal(e)))),
      entityId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List notes/history for an item (newest first)" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(notes)
      .where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    return row ?? status(404, { message: "Note not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a note" } })
  .post("/", async ({ body, status }) => {
    if (!(await entityExists(body.entityType, body.entityId)))
      return status(422, { message: "Referenced entity does not exist (or is archived)" });
    const [{ id }] = await db.insert(notes).values(body).$returningId();
    const [row] = await db.select().from(notes).where(eq(notes.id, id));
    return row;
  }, { body: NoteBody, detail: { summary: "Add a note (history/reference/general)" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(notes).set({ ...body, ...touch() })
      .where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    const [row] = await db.select().from(notes)
      .where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    return row ?? status(404, { message: "Note not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(t.Omit(NoteBody, ["entityType", "entityId"])), detail: { summary: "Edit a note (keeps the row, bumps updated_at_UTC)" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(notes).set(archiveMark()).where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: notes.id }).from(notes).where(eq(notes.id, params.id));
      if (!row) return status(404, { message: "Note not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a note" } })
  .post("/:id/restore", async ({ params, status }) => {
    const res = await db.update(notes).set(restoreMark()).where(eq(notes.id, params.id));
    if (!affected(res)) return status(404, { message: "Note not found" });
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a note" } });
