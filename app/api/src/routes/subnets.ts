import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { subnets, TRUST_ZONES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isDupError, affected } from "../lib/util.ts";

const SubnetBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  cidr: t.String({ minLength: 1, maxLength: 43 }),
  vlanId: t.Optional(t.Nullable(t.Integer())),
  trustZone: t.Optional(t.Union(TRUST_ZONES.map((z) => t.Literal(z)))),
  gateway: t.Optional(t.Nullable(t.String({ maxLength: 45 }))),
  dnsServers: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  description: t.Optional(t.Nullable(t.String())),
});

const DUP_MESSAGE = "A subnet with that name or CIDR already exists";

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
    const [row] = await db.select().from(subnets)
      .where(and(eq(subnets.id, params.id), isNull(subnets.archivedAtUTC)));
    return row ?? status(404, { message: "Subnet not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get a subnet" } })
  .post("/", async ({ body, status }) => {
    try {
      const [{ id }] = await db.insert(subnets).values(body).$returningId();
      const [row] = await db.select().from(subnets).where(eq(subnets.id, id));
      return row;
    } catch (e) {
      if (isDupError(e)) return status(409, { message: DUP_MESSAGE });
      throw e;
    }
  }, { body: SubnetBody, detail: { summary: "Create a subnet" } })
  .patch("/:id", async ({ params, body, status }) => {
    try {
      await db.update(subnets).set({ ...body, ...touch() })
        .where(and(eq(subnets.id, params.id), isNull(subnets.archivedAtUTC)));
    } catch (e) {
      if (isDupError(e)) return status(409, { message: DUP_MESSAGE });
      throw e;
    }
    const [row] = await db.select().from(subnets)
      .where(and(eq(subnets.id, params.id), isNull(subnets.archivedAtUTC)));
    return row ?? status(404, { message: "Subnet not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(SubnetBody), detail: { summary: "Update a subnet" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(subnets)
      .set(archiveMark())
      .where(and(eq(subnets.id, params.id), isNull(subnets.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: subnets.id }).from(subnets).where(eq(subnets.id, params.id));
      if (!row) return status(404, { message: "Subnet not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Archive (soft-delete) a subnet" } })
  .post("/:id/restore", async ({ params, status }) => {
    try {
      const res = await db.update(subnets).set(restoreMark()).where(eq(subnets.id, params.id));
      if (!affected(res)) return status(404, { message: "Subnet not found" });
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Cannot restore: name or CIDR now conflicts with an active subnet" });
      throw e;
    }
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore an archived subnet" } });
