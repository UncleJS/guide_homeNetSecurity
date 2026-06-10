import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { links, LINK_TYPES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isFkError, affected } from "../lib/util.ts";

const LinkBody = t.Object({
  sourceDeviceId: t.Integer(),
  targetDeviceId: t.Integer(),
  linkType: t.Optional(t.Union(LINK_TYPES.map((l) => t.Literal(l)))),
  label: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const linkRoutes = new Elysia({ prefix: "/links", tags: ["Topology Links"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const rows = await db.select().from(links).where(isNull(links.archivedAtUTC))
      .orderBy(desc(links.id)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List explicit topology links" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(links)
      .where(and(eq(links.id, params.id), isNull(links.archivedAtUTC)));
    return row ?? status(404, { message: "Link not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a link" } })
  .post("/", async ({ body, status }) => {
    if (body.sourceDeviceId === body.targetDeviceId)
      return status(422, { message: "A link must connect two different devices" });
    try {
      const [{ id }] = await db.insert(links).values(body).$returningId();
      const [row] = await db.select().from(links).where(eq(links.id, id));
      return row;
    } catch (e) {
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
  }, { body: LinkBody, detail: { summary: "Create a device-to-device uplink" } })
  .patch("/:id", async ({ params, body, status }) => {
    try {
      await db.update(links).set({ ...body, ...touch() })
        .where(and(eq(links.id, params.id), isNull(links.archivedAtUTC)));
    } catch (e) {
      if (isFkError(e)) return status(422, { message: "Referenced device does not exist" });
      throw e;
    }
    const [row] = await db.select().from(links)
      .where(and(eq(links.id, params.id), isNull(links.archivedAtUTC)));
    return row ?? status(404, { message: "Link not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(LinkBody), detail: { summary: "Update a link" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(links).set(archiveMark()).where(and(eq(links.id, params.id), isNull(links.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: links.id }).from(links).where(eq(links.id, params.id));
      if (!row) return status(404, { message: "Link not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a link" } })
  .post("/:id/restore", async ({ params, status }) => {
    const res = await db.update(links).set(restoreMark()).where(eq(links.id, params.id));
    if (!affected(res)) return status(404, { message: "Link not found" });
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived link" } });
