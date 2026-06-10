import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { notes, NOTE_CATEGORIES, NOTE_ENTITIES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark } from "../lib/util.ts";

const NoteBody = t.Object({
  entityType: t.Union(NOTE_ENTITIES.map((e) => t.Literal(e))),
  entityId: t.Integer(),
  category: t.Optional(t.Union(NOTE_CATEGORIES.map((c) => t.Literal(c)))),
  body: t.String({ minLength: 1 }),
  author: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
});

export const noteRoutes = new Elysia({ prefix: "/notes", tags: ["Notes"] })
  .get("/", async ({ query }) => {
    // Notes/history for an item, newest first.
    const conds = [isNull(notes.archivedAtUTC)];
    if (query.entityType) conds.push(eq(notes.entityType, query.entityType));
    if (query.entityId) conds.push(eq(notes.entityId, query.entityId));
    return db.select().from(notes).where(and(...conds)).orderBy(desc(notes.createdAtUTC));
  }, {
    query: t.Object({
      entityType: t.Optional(t.Union(NOTE_ENTITIES.map((e) => t.Literal(e)))),
      entityId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List notes/history for an item (newest first)" },
  })
  .post("/", async ({ body }) => {
    const [{ id }] = await db.insert(notes).values(body).$returningId();
    const [row] = await db.select().from(notes).where(eq(notes.id, id));
    return row;
  }, { body: NoteBody, detail: { summary: "Add a note (history/reference/general)" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(notes).set({ ...body, ...touch() }).where(eq(notes.id, params.id));
    const [row] = await db.select().from(notes).where(eq(notes.id, params.id));
    return row ?? status(404, { message: "Note not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(t.Omit(NoteBody, ["entityType", "entityId"])), detail: { summary: "Edit a note (keeps the row, bumps updated_at_UTC)" } })
  .post("/:id/archive", async ({ params }) => {
    await db.update(notes).set(archiveMark()).where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a note" } })
  .post("/:id/restore", async ({ params }) => {
    await db.update(notes).set(restoreMark()).where(eq(notes.id, params.id));
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a note" } });
