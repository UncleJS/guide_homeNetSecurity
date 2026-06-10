import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { links, LINK_TYPES } from "../db/schema.ts";
import { touch, archiveMark } from "../lib/util.ts";

const LinkBody = t.Object({
  sourceDeviceId: t.Integer(),
  targetDeviceId: t.Integer(),
  linkType: t.Optional(t.Union(LINK_TYPES.map((l) => t.Literal(l)))),
  label: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
  notes: t.Optional(t.Nullable(t.String())),
});

export const linkRoutes = new Elysia({ prefix: "/links", tags: ["Topology Links"] })
  .get("/", async () =>
    db.select().from(links).where(isNull(links.archivedAtUTC)).orderBy(desc(links.id)),
    { detail: { summary: "List explicit topology links" } })
  .post("/", async ({ body, status }) => {
    if (body.sourceDeviceId === body.targetDeviceId)
      return status(422, { message: "A link must connect two different devices" });
    const [{ id }] = await db.insert(links).values(body).$returningId();
    const [row] = await db.select().from(links).where(eq(links.id, id));
    return row;
  }, { body: LinkBody, detail: { summary: "Create a device-to-device uplink" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(links).set({ ...body, ...touch() }).where(eq(links.id, params.id));
    const [row] = await db.select().from(links).where(eq(links.id, params.id));
    return row ?? status(404, { message: "Link not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(LinkBody), detail: { summary: "Update a link" } })
  .post("/:id/archive", async ({ params }) => {
    await db.update(links).set(archiveMark()).where(and(eq(links.id, params.id), isNull(links.archivedAtUTC)));
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive a link" } });
