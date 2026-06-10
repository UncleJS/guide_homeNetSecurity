import { Elysia, t } from "elysia";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { ipAddresses, ASSIGNMENT_TYPES } from "../db/schema.ts";
import { touch, archiveMark, restoreMark, paginate, isDupError, isFkError, affected } from "../lib/util.ts";

const IpBody = t.Object({
  subnetId: t.Integer(),
  deviceId: t.Optional(t.Nullable(t.Integer())),
  address: t.String({ minLength: 1, maxLength: 45 }),
  assignmentType: t.Optional(t.Union(ASSIGNMENT_TYPES.map((a) => t.Literal(a)))),
  macAddress: t.Optional(t.Nullable(t.String({ maxLength: 17 }))),
  status: t.Optional(t.String({ maxLength: 30 })),
});

export const ipRoutes = new Elysia({ prefix: "/ip-addresses", tags: ["IP Addresses"] })
  .get("/", async ({ query }) => {
    const { offset, limit, page, pageSize } = paginate(query);
    const conds = [];
    if (!query.includeArchived) conds.push(isNull(ipAddresses.archivedAtUTC));
    if (query.subnetId) conds.push(eq(ipAddresses.subnetId, query.subnetId));
    if (query.deviceId) conds.push(eq(ipAddresses.deviceId, query.deviceId));
    const rows = await db.select().from(ipAddresses)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(ipAddresses.id)).limit(limit).offset(offset);
    return { page, pageSize, data: rows };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()), pageSize: t.Optional(t.Numeric()),
      includeArchived: t.Optional(t.Boolean()),
      subnetId: t.Optional(t.Numeric()), deviceId: t.Optional(t.Numeric()),
    }),
    detail: { summary: "List IP allocations" },
  })
  .get("/:id", async ({ params, status }) => {
    const [row] = await db.select().from(ipAddresses)
      .where(and(eq(ipAddresses.id, params.id), isNull(ipAddresses.archivedAtUTC)));
    return row ?? status(404, { message: "IP not found" });
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Get an IP allocation" } })
  .post("/", async ({ body, status }) => {
    try {
      const [{ id }] = await db.insert(ipAddresses).values(body).$returningId();
      const [row] = await db.select().from(ipAddresses).where(eq(ipAddresses.id, id));
      return row;
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "That address (or MAC) already exists in this subnet" });
      if (isFkError(e)) return status(422, { message: "Referenced subnet or device does not exist" });
      throw e;
    }
  }, { body: IpBody, detail: { summary: "Allocate an IP address" } })
  .patch("/:id", async ({ params, body, status }) => {
    try {
      await db.update(ipAddresses).set({ ...body, ...touch() })
        .where(and(eq(ipAddresses.id, params.id), isNull(ipAddresses.archivedAtUTC)));
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "That address (or MAC) already exists in this subnet" });
      if (isFkError(e)) return status(422, { message: "Referenced subnet or device does not exist" });
      throw e;
    }
    const [row] = await db.select().from(ipAddresses)
      .where(and(eq(ipAddresses.id, params.id), isNull(ipAddresses.archivedAtUTC)));
    return row ?? status(404, { message: "IP not found" });
  }, { params: t.Object({ id: t.Numeric() }), body: t.Partial(IpBody), detail: { summary: "Update an IP allocation" } })
  .post("/:id/archive", async ({ params, status }) => {
    const res = await db.update(ipAddresses).set(archiveMark()).where(and(eq(ipAddresses.id, params.id), isNull(ipAddresses.archivedAtUTC)));
    if (!affected(res)) {
      // Already archived is an idempotent no-op; missing is a 404.
      const [row] = await db.select({ id: ipAddresses.id }).from(ipAddresses).where(eq(ipAddresses.id, params.id));
      if (!row) return status(404, { message: "IP not found" });
    }
    return { archived: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Release (archive) an IP allocation" } })
  .post("/:id/restore", async ({ params, status }) => {
    try {
      const res = await db.update(ipAddresses).set(restoreMark()).where(eq(ipAddresses.id, params.id));
      if (!affected(res)) return status(404, { message: "IP not found" });
    } catch (e) {
      if (isDupError(e)) return status(409, { message: "Cannot restore: address now conflicts with an active allocation" });
      throw e;
    }
    return { restored: true };
  }, { params: t.Object({ id: t.Numeric() }), detail: { summary: "Restore a released IP allocation" } });
