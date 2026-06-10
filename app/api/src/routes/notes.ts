import { Elysia, t } from "elysia";
import { and, eq, isNull, isNotNull, desc, asc, lte, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  notes,
  subnets,
  devices,
  ipAddresses,
  scanRuns,
  NOTE_CATEGORIES,
  NOTE_ENTITIES,
  NOTE_STATUSES,
  NOTE_PRIORITIES,
} from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, affected } from "../lib/util.ts";

const NoteBody = t.Object({
  // Both present => attached to an entity; both absent/null => general note.
  entityType: t.Optional(t.Nullable(t.Union(NOTE_ENTITIES.map((e) => t.Literal(e))))),
  entityId: t.Optional(t.Nullable(t.Integer())),
  category: t.Optional(t.Union(NOTE_CATEGORIES.map((c) => t.Literal(c)))),
  body: t.String({ minLength: 1 }),
  author: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  // Action item: status non-null. status null/absent = plain note.
  status: t.Optional(t.Nullable(t.Union(NOTE_STATUSES.map((s) => t.Literal(s))))),
  priority: t.Optional(t.Nullable(t.Union(NOTE_PRIORITIES.map((p) => t.Literal(p))))),
  dueAtUTC: t.Optional(t.Nullable(t.String())), // ISO-8601 UTC
});

type NoteInput = Partial<typeof NoteBody.static>;

// Convert the ISO transport string into a Date for the datetime column.
function normalizeDue<T extends NoteInput>(body: T) {
  const { dueAtUTC, ...rest } = body;
  return {
    ...rest,
    ...(dueAtUTC !== undefined ? { dueAtUTC: dueAtUTC === null ? null : new Date(dueAtUTC) } : {}),
  };
}

// Cross-field checks Elysia's schema can't express; returns a 422 message or null.
// `merged` carries the post-update view of the action-item fields (PATCH merges
// the existing row first); dueAtUTC may already be a Date there.
function validateNote(input: NoteInput, merged: {
  status: string | null;
  priority: string | null;
  dueAtUTC: string | Date | null;
}): string | null {
  const hasType = input.entityType != null;
  const hasId = input.entityId != null;
  if (hasType !== hasId) return "entityType and entityId must be provided together";
  if (merged.status == null && (merged.dueAtUTC != null || merged.priority != null)) {
    return "dueAtUTC and priority require an action item (set status to open or done)";
  }
  if (typeof input.dueAtUTC === "string" && Number.isNaN(Date.parse(input.dueAtUTC))) {
    return "dueAtUTC must be a valid ISO-8601 datetime";
  }
  return null;
}

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
    case "scan_run": {
      const [row] = await db.select({ id: scanRuns.id }).from(scanRuns)
        .where(and(eq(scanRuns.id, entityId), isNull(scanRuns.archivedAtUTC)));
      return Boolean(row);
    }
  }
}

export const noteRoutes = new Elysia({ prefix: "/notes", tags: ["Notes"] })
  .get("/", async ({ query }) => {
    // Notes/history, newest first. Filter by entity, scope, or action-item state.
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [];
    if (!query.includeArchived) conds.push(isNull(notes.archivedAtUTC));
    if (query.entityType) conds.push(eq(notes.entityType, query.entityType));
    if (query.entityId) conds.push(eq(notes.entityId, query.entityId));
    if (query.scope === "general") conds.push(isNull(notes.entityType));
    if (query.scope === "entity") conds.push(isNotNull(notes.entityType));
    if (query.actionItems !== undefined) {
      conds.push(query.actionItems ? isNotNull(notes.status) : isNull(notes.status));
    }
    if (query.status) conds.push(eq(notes.status, query.status));
    if (query.priority) conds.push(eq(notes.priority, query.priority));
    if (query.dueBefore) conds.push(lte(notes.dueAtUTC, new Date(query.dueBefore)));
    const rows = await db.select().from(notes)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(notes.createdAtUTC)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      entityType: t.Optional(t.Union(NOTE_ENTITIES.map((e) => t.Literal(e)))),
      entityId: t.Optional(t.Numeric()),
      scope: t.Optional(t.Union([t.Literal("general"), t.Literal("entity")])),
      actionItems: t.Optional(t.Boolean()),
      status: t.Optional(t.Union(NOTE_STATUSES.map((s) => t.Literal(s)))),
      priority: t.Optional(t.Union(NOTE_PRIORITIES.map((p) => t.Literal(p)))),
      dueBefore: t.Optional(t.String()),
      includeArchived: t.Optional(t.Boolean()),
    }),
    detail: { summary: "List notes (newest first; filter by entity, scope, or action-item state)" },
  })
  .get("/action-items", async ({ query }) => {
    // Dashboard feed: open action items, overdue/soonest first, undated last,
    // then priority. "Overdue" is computed client-side against the local clock.
    const rows = await db.select().from(notes)
      .where(and(isNull(notes.archivedAtUTC), eq(notes.status, "open")))
      .orderBy(
        sql`(${notes.dueAtUTC} is null) asc`,
        asc(notes.dueAtUTC),
        sql`field(${notes.priority}, 'high', 'medium', 'low')`,
        desc(notes.createdAtUTC),
      )
      .limit(Math.min(50, query.limit ?? 10));
    return { data: rows };
  }, {
    query: t.Object({ limit: t.Optional(t.Numeric()) }),
    detail: { summary: "Open action items (overdue/soonest first, undated last, then priority)" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(notes)
      .where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    return row ?? status(404, { message: "Note not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a note" } })
  .post("/", async ({ body, status }) => {
    const problem = validateNote(body, {
      status: body.status ?? null,
      priority: body.priority ?? null,
      dueAtUTC: body.dueAtUTC ?? null,
    });
    if (problem) return status(422, { message: problem });
    if (body.entityType != null && body.entityId != null) {
      if (!(await entityExists(body.entityType, body.entityId)))
        return status(422, { message: "Referenced entity does not exist (or is archived)" });
    }
    const values = normalizeDue(body);
    const [{ id }] = await db.insert(notes).values(values).$returningId();
    const [row] = await db.select().from(notes).where(eq(notes.id, id));
    return row;
  }, { body: NoteBody, detail: { summary: "Add a note (entity-attached or general; optionally an action item)" } })
  .patch("/:id", async ({ params, body, status }) => {
    const [existing] = await db.select().from(notes)
      .where(and(eq(notes.id, params.id), isNull(notes.archivedAtUTC)));
    if (!existing) return status(404, { message: "Note not found" });
    // Post-update view: demoting (status: null) clears due/priority server-side,
    // so validate against nulls rather than the existing row's values.
    const demoting = body.status === null;
    const merged = {
      status: body.status !== undefined ? body.status : existing.status,
      priority: demoting ? null : body.priority !== undefined ? body.priority : existing.priority,
      dueAtUTC: demoting ? null : body.dueAtUTC !== undefined ? body.dueAtUTC : existing.dueAtUTC,
    };
    const problem = validateNote(body, merged);
    if (problem) return status(422, { message: problem });
    const patch: Record<string, unknown> = { ...normalizeDue(body), ...touch() };
    if (body.status !== undefined) {
      if (body.status === "done" && existing.status !== "done") {
        patch.doneAtUTC = sql`UTC_TIMESTAMP()`;
      } else if (body.status === "open") {
        patch.doneAtUTC = null;
      } else if (body.status === null) {
        // Demoted to a plain note: clear all action-item fields.
        patch.dueAtUTC = null;
        patch.priority = null;
        patch.doneAtUTC = null;
      }
    }
    await db.update(notes).set(patch)
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
