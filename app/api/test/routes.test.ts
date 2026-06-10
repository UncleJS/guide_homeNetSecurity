import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

// Endpoint tests run against a scratch database in the pod's MariaDB so the
// real `netinventory` data is never touched. Requires MARIADB_ROOT_PASSWORD.
const TEST_DB = "netinventory_test";
const HOST = process.env.DB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DB_PORT ?? 3306);
const USER = process.env.MARIADB_USER ?? "netinventory";

const root = await mysql.createConnection({
  host: HOST,
  port: PORT,
  user: "root",
  password: process.env.MARIADB_ROOT_PASSWORD ?? "",
});
await root.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
await root.query(`CREATE DATABASE \`${TEST_DB}\``);
await root.query(`GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${USER}'@'%'`);
await root.query("FLUSH PRIVILEGES");
await root.end();

// Point the app at the scratch DB *before* it is imported.
process.env.MARIADB_DATABASE = TEST_DB;

const migrator = await mysql.createConnection({
  host: HOST, port: PORT, user: USER,
  password: process.env.MARIADB_PASSWORD ?? "",
  database: TEST_DB, timezone: "Z", multipleStatements: true,
});
await migrate(drizzle(migrator), { migrationsFolder: "./drizzle" });
await migrator.end();

const { app } = await import("../src/app.ts");
const { pool } = await import("../src/db/client.ts");

afterAll(async () => {
  await pool.end();
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.handle(new Request(`http://test.local/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

const ENVELOPE = (r: { body: { page?: number; pageSize?: number; data?: unknown[] } }) => {
  expect(r.body.page).toBeNumber();
  expect(r.body.pageSize).toBeNumber();
  expect(Array.isArray(r.body.data)).toBe(true);
};

describe("health", () => {
  it("responds ok", async () => {
    const res = await app.handle(new Request("http://test.local/health"));
    expect(res.status).toBe(200);
  });
});

describe("subnet lifecycle (archive-only)", () => {
  let id: number;

  it("creates a subnet", async () => {
    const r = await call("POST", "/subnets", { name: "Test LAN", cidr: "10.99.0.0/24" });
    expect(r.status).toBe(200);
    id = r.body.id;
    expect(r.body.archivedAtUTC).toBeNull();
  });

  it("rejects a duplicate active name with 409", async () => {
    const r = await call("POST", "/subnets", { name: "Test LAN", cidr: "10.98.0.0/24" });
    expect(r.status).toBe(409);
  });

  it("returns the paginated envelope on list", async () => {
    const r = await call("GET", "/subnets");
    expect(r.status).toBe(200);
    ENVELOPE(r);
  });

  it("gets and patches an active subnet", async () => {
    expect((await call("GET", `/subnets/${id}`)).status).toBe(200);
    const r = await call("PATCH", `/subnets/${id}`, { vlanId: 99 });
    expect(r.status).toBe(200);
    expect(r.body.vlanId).toBe(99);
  });

  it("archives; archived rows then 404 on GET/PATCH and vanish from the default list", async () => {
    expect((await call("POST", `/subnets/${id}/archive`)).status).toBe(200);
    expect((await call("GET", `/subnets/${id}`)).status).toBe(404);
    expect((await call("PATCH", `/subnets/${id}`, { vlanId: 1 })).status).toBe(404);
    const list = await call("GET", "/subnets?pageSize=200");
    expect(list.body.data.some((s: { id: number }) => s.id === id)).toBe(false);
    const all = await call("GET", "/subnets?pageSize=200&includeArchived=true");
    expect(all.body.data.some((s: { id: number }) => s.id === id)).toBe(true);
  });

  it("re-archiving is an idempotent no-op", async () => {
    const r = await call("POST", `/subnets/${id}/archive`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ archived: true });
  });

  it("404s archive/restore for a nonexistent id", async () => {
    expect((await call("POST", "/subnets/999999/archive")).status).toBe(404);
    expect((await call("POST", "/subnets/999999/restore")).status).toBe(404);
  });

  it("409s restore when the name was reclaimed by an active subnet", async () => {
    const clash = await call("POST", "/subnets", { name: "Test LAN", cidr: "10.97.0.0/24" });
    expect(clash.status).toBe(200);
    expect((await call("POST", `/subnets/${id}/restore`)).status).toBe(409);
    await call("POST", `/subnets/${clash.body.id}/archive`);
  });

  it("restores once the conflict is gone", async () => {
    expect((await call("POST", `/subnets/${id}/restore`)).status).toBe(200);
    expect((await call("GET", `/subnets/${id}`)).status).toBe(200);
  });
});

describe("devices and seeded hardening checklist", () => {
  let deviceId: number;

  it("creates a device and seeds its checklist", async () => {
    const r = await call("POST", "/devices", { hostname: "test-host" });
    expect(r.status).toBe(200);
    deviceId = r.body.id;
    const items = await call("GET", `/hardening-items?deviceId=${deviceId}`);
    ENVELOPE(items);
    expect(items.body.data.length).toBeGreaterThanOrEqual(5);
  });

  it("GET /devices/:id embeds ips/ports/hardening/notes", async () => {
    const r = await call("GET", `/devices/${deviceId}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.ips)).toBe(true);
    expect(Array.isArray(r.body.ports)).toBe(true);
    expect(Array.isArray(r.body.hardening)).toBe(true);
    expect(Array.isArray(r.body.notes)).toBe(true);
  });

  it("hardening item: GET /:id, done-stamp, archive and restore", async () => {
    const items = await call("GET", `/hardening-items?deviceId=${deviceId}`);
    const itemId = items.body.data[0].id;
    expect((await call("GET", `/hardening-items/${itemId}`)).status).toBe(200);
    const done = await call("PATCH", `/hardening-items/${itemId}`, { state: "done" });
    expect(done.body.completedAtUTC).not.toBeNull();
    const undone = await call("PATCH", `/hardening-items/${itemId}`, { state: "pending" });
    expect(undone.body.completedAtUTC).toBeNull();
    expect((await call("POST", `/hardening-items/${itemId}/archive`)).status).toBe(200);
    expect((await call("GET", `/hardening-items/${itemId}`)).status).toBe(404);
    expect((await call("POST", `/hardening-items/${itemId}/restore`)).status).toBe(200);
    expect((await call("GET", `/hardening-items/${itemId}`)).status).toBe(200);
  });
});

describe("foreign keys are enforced", () => {
  it("422s an IP for a nonexistent subnet", async () => {
    const r = await call("POST", "/ip-addresses", { subnetId: 999999, address: "10.0.0.1" });
    expect(r.status).toBe(422);
  });

  it("422s a port for a nonexistent device", async () => {
    const r = await call("POST", "/device-ports", { deviceId: 999999, port: 22 });
    expect(r.status).toBe(422);
  });

  it("422s a hardening item for a nonexistent device", async () => {
    const r = await call("POST", "/hardening-items", { deviceId: 999999, control: "x" });
    expect(r.status).toBe(422);
  });

  it("422s a link to a nonexistent device", async () => {
    const r = await call("POST", "/links", { sourceDeviceId: 999999, targetDeviceId: 999998 });
    expect(r.status).toBe(422);
  });
});

describe("ip addresses", () => {
  let subnetId: number;
  let ipId: number;

  it("allocates in a real subnet", async () => {
    const s = await call("POST", "/subnets", { name: "IP test net", cidr: "10.96.0.0/24" });
    subnetId = s.body.id;
    const r = await call("POST", "/ip-addresses", { subnetId, address: "10.96.0.10" });
    expect(r.status).toBe(200);
    ipId = r.body.id;
    expect((await call("GET", `/ip-addresses/${ipId}`)).status).toBe(200);
  });

  it("409s a duplicate active address in the same subnet", async () => {
    const r = await call("POST", "/ip-addresses", { subnetId, address: "10.96.0.10" });
    expect(r.status).toBe(409);
  });

  it("409s restore when the address was reclaimed", async () => {
    await call("POST", `/ip-addresses/${ipId}/archive`);
    expect((await call("GET", `/ip-addresses/${ipId}`)).status).toBe(404);
    const again = await call("POST", "/ip-addresses", { subnetId, address: "10.96.0.10" });
    expect(again.status).toBe(200);
    expect((await call("POST", `/ip-addresses/${ipId}/restore`)).status).toBe(409);
    await call("POST", `/ip-addresses/${again.body.id}/archive`);
    expect((await call("POST", `/ip-addresses/${ipId}/restore`)).status).toBe(200);
  });

  it("returns the paginated envelope on list", async () => {
    ENVELOPE(await call("GET", "/ip-addresses"));
  });
});

describe("device ports", () => {
  let deviceId: number;
  let portId: number;

  it("records, gets, archives, restores", async () => {
    const d = await call("POST", "/devices", { hostname: "port-host" });
    deviceId = d.body.id;
    const r = await call("POST", "/device-ports", { deviceId, port: 443, protocol: "tcp" });
    expect(r.status).toBe(200);
    portId = r.body.id;
    ENVELOPE(await call("GET", "/device-ports"));
    expect((await call("POST", `/device-ports/${portId}/archive`)).status).toBe(200);
    expect((await call("GET", `/device-ports/${portId}`)).status).toBe(404);
    expect((await call("PATCH", `/device-ports/${portId}`, { port: 80 })).status).toBe(404);
    expect((await call("POST", `/device-ports/${portId}/restore`)).status).toBe(200);
    expect((await call("GET", `/device-ports/${portId}`)).status).toBe(200);
  });
});

describe("topology links", () => {
  let a: number;
  let b: number;
  let linkId: number;

  it("rejects a self-link with 422", async () => {
    const d = await call("POST", "/devices", { hostname: "link-a" });
    a = d.body.id;
    const e = await call("POST", "/devices", { hostname: "link-b" });
    b = e.body.id;
    expect((await call("POST", "/links", { sourceDeviceId: a, targetDeviceId: a })).status).toBe(422);
  });

  it("creates, lists with envelope, archives, restores", async () => {
    const r = await call("POST", "/links", { sourceDeviceId: a, targetDeviceId: b });
    expect(r.status).toBe(200);
    linkId = r.body.id;
    ENVELOPE(await call("GET", "/links"));
    expect((await call("POST", `/links/${linkId}/archive`)).status).toBe(200);
    expect((await call("GET", `/links/${linkId}`)).status).toBe(404);
    expect((await call("POST", `/links/${linkId}/restore`)).status).toBe(200);
    expect((await call("GET", `/links/${linkId}`)).status).toBe(200);
  });
});

describe("scan schedules", () => {
  let subnetId: number;
  let scheduleId: number;
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

  it("creates a weekly subnet schedule", async () => {
    const s = await call("POST", "/subnets", { name: "Scan test net", cidr: "10.95.0.0/24" });
    subnetId = s.body.id;
    const r = await call("POST", "/schedules", {
      name: "Weekly test sweep", targetType: "subnet", subnetId,
      recurrence: "weekly", nextRunAtUTC: future,
      reminderMinutesBefore: 30, reminderEmail: "ops@example.com",
    });
    expect(r.status).toBe(200);
    scheduleId = r.body.id;
    expect(r.body.portSpec).toBe("top100");
    expect(r.body.enabled).toBe(1);
  });

  it("409s a duplicate active name", async () => {
    const r = await call("POST", "/schedules", {
      name: "Weekly test sweep", targetType: "subnet", subnetId, nextRunAtUTC: future,
    });
    expect(r.status).toBe(409);
  });

  it("422s mismatched target fields", async () => {
    expect((await call("POST", "/schedules", {
      name: "Bad target", targetType: "subnet", deviceId: 1, nextRunAtUTC: future,
    })).status).toBe(422);
    expect((await call("POST", "/schedules", {
      name: "Bad target", targetType: "device", nextRunAtUTC: future,
    })).status).toBe(422);
    expect((await call("POST", "/schedules", {
      name: "Bad ports", targetType: "subnet", subnetId, nextRunAtUTC: future, portSpec: "1;rm",
    })).status).toBe(422);
  });

  it("lists with the envelope and last-run fields", async () => {
    const r = await call("GET", "/schedules");
    ENVELOPE(r);
    const row = r.body.data.find((x: { id: number }) => x.id === scheduleId);
    expect(row.lastRunStatus).toBeNull();
  });

  it("patches and resets the reminder marker on reschedule", async () => {
    const r = await call("PATCH", `/schedules/${scheduleId}`, {
      nextRunAtUTC: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    expect(r.status).toBe(200);
    expect(r.body.reminderSentForUTC).toBeNull();
  });

  it("serves the calendar feed with computed occurrences", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const r = await call("GET", `/schedules/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.runs)).toBe(true);
    expect(r.body.occurrences.filter((o: { scheduleId: number }) => o.scheduleId === scheduleId).length).toBeGreaterThanOrEqual(1);
  });

  it("422s an oversized or inverted calendar range", async () => {
    const from = new Date().toISOString();
    const farOut = new Date(Date.now() + 90 * 86_400_000).toISOString();
    expect((await call("GET", `/schedules/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(farOut)}`)).status).toBe(422);
    expect((await call("GET", `/schedules/calendar?from=${encodeURIComponent(farOut)}&to=${encodeURIComponent(from)}`)).status).toBe(422);
  });

  it("archives and restores", async () => {
    expect((await call("POST", `/schedules/${scheduleId}/archive`)).status).toBe(200);
    expect((await call("GET", `/schedules/${scheduleId}`)).status).toBe(404);
    expect((await call("POST", `/schedules/${scheduleId}/restore`)).status).toBe(200);
    expect((await call("GET", `/schedules/${scheduleId}`)).status).toBe(200);
  });

  it("503s the test email when SMTP is unconfigured", async () => {
    delete process.env.SMTP_HOST;
    const r = await call("POST", "/schedules/test-email", { to: "ops@example.com" });
    expect(r.status).toBe(503);
  });
});

describe("scan runs (run-now without nmap dependency)", () => {
  let runId: number;

  it("run-now on a device with no IPs produces a failed run with a clear error", async () => {
    const d = await call("POST", "/devices", { hostname: "scanless-host" });
    const s = await call("POST", "/schedules", {
      name: "Device run-now test", targetType: "device", deviceId: d.body.id,
      nextRunAtUTC: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(s.status).toBe(200);
    const r = await call("POST", `/schedules/${s.body.id}/run-now`, {});
    expect(r.status).toBe(200);
    runId = r.body.id;
    // The scan fails fast (no IPs) in the background — poll until it settles.
    let run = r.body;
    for (let i = 0; i < 20 && run.status === "running"; i++) {
      await Bun.sleep(100);
      run = (await call("GET", `/scan-runs/${runId}`)).body;
    }
    expect(run.status).toBe("failed");
    expect(run.error).toContain("no active IP addresses");
    expect(Array.isArray(run.findings)).toBe(true);
  });

  it("lists runs with the envelope and schedule name", async () => {
    const r = await call("GET", "/scan-runs");
    ENVELOPE(r);
    expect(r.body.data.find((x: { id: number }) => x.id === runId)?.scheduleName).toBe("Device run-now test");
  });

  it("404s a findings PATCH for a nonexistent finding", async () => {
    const r = await call("PATCH", `/scan-runs/${runId}/findings/999999`, { notes: "x" });
    expect(r.status).toBe(404);
  });

  it("accepts a detailed note attached to the run (scan_run entity)", async () => {
    const r = await call("POST", "/notes", { entityType: "scan_run", entityId: runId, body: "Analyst write-up" });
    expect(r.status).toBe(200);
    const list = await call("GET", `/notes?entityType=scan_run&entityId=${runId}`);
    expect(list.body.data.some((n: { body: string }) => n.body === "Analyst write-up")).toBe(true);
  });

  it("archives and restores a run", async () => {
    expect((await call("POST", `/scan-runs/${runId}/archive`)).status).toBe(200);
    expect((await call("GET", `/scan-runs/${runId}`)).status).toBe(404);
    expect((await call("POST", `/scan-runs/${runId}/restore`)).status).toBe(200);
    expect((await call("GET", `/scan-runs/${runId}`)).status).toBe(200);
  });
});

describe("notes (polymorphic target must exist)", () => {
  let deviceId: number;
  let noteId: number;

  it("422s a note for a nonexistent device", async () => {
    const r = await call("POST", "/notes", { entityType: "device", entityId: 999999, body: "hello" });
    expect(r.status).toBe(422);
  });

  it("creates for a real device, lists with envelope, archives, restores", async () => {
    const d = await call("POST", "/devices", { hostname: "note-host" });
    deviceId = d.body.id;
    const r = await call("POST", "/notes", { entityType: "device", entityId: deviceId, body: "hello" });
    expect(r.status).toBe(200);
    noteId = r.body.id;
    ENVELOPE(await call("GET", `/notes?entityType=device&entityId=${deviceId}`));
    expect((await call("PATCH", `/notes/${noteId}`, { body: "edited" })).body.body).toBe("edited");
    expect((await call("POST", `/notes/${noteId}/archive`)).status).toBe(200);
    expect((await call("GET", `/notes/${noteId}`)).status).toBe(404);
    expect((await call("POST", `/notes/${noteId}/restore`)).status).toBe(200);
  });
});
