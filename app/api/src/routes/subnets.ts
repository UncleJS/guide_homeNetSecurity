import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { subnets, TRUST_ZONES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate } from "../lib/util.ts";

const SubnetBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  cidr: t.String({ minLength: 1, maxLength: 43 }),
  vlanId: t.Optional(t.Nullable(t.Integer())),
  trustZone: t.Optional(t.Union(TRUST_ZONES.map((z) => t.Literal(z)))),
  gateway: t.Optional(t.Nullable(t.String({ maxLength: 45 }))),
  dnsServers: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  description: t.Optional(t.Nullable(t.String())),
});

export const subnetRoutes = new Elysia({ prefix: "/subnets", tags: ["Subnets"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const where = query.includeArchived ? undefined : isNull(subnets.archivedAtUTC);
    const rows = await db
      .select()
      .from(subnets)
      .where(where)
      .orderBy(desc(subnets.id))
      .limit(limit)
      .offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
      includeArchived: t.Optional(t.Boolean()),
    }),
    detail: { summary: "List subnets / VLANs" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(subnets).where(eq(subnets.id, params.id));
    return row ?? status(404, { message: "Subnet not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a subnet" } })
  .post("/", async ({ body }) => {
    const [{ id }] = await db.insert(subnets).values(body).$returningId();
    const [row] = await db.select().from(subnets).where(eq(subnets.id, id));
    return row;
  }, { body: SubnetBody, detail: { summary: "Create a subnet" } })
  .patch("/:id", async ({ params, body, status }) => {
    await db.update(subnets).set({ ...body, ...touch() }).where(eq(subnets.id, params.id));
    const [row] = await db.select().from(subnets).where(eq(subnets.id, params.id));
    return row ?? status(404, { message: "Subnet not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(SubnetBody), detail: { summary: "Update a subnet" } })
  .post("/:id/archive", async ({ params }) => {
    await db.update(subnets)
      .set(archiveMark())
      .where(and(eq(subnets.id, params.id), isNull(subnets.archivedAtUTC)));
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive (soft-delete) a subnet" } })
  .post("/:id/restore", async ({ params }) => {
    await db.update(subnets).set(restoreMark()).where(eq(subnets.id, params.id));
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived subnet" } });
