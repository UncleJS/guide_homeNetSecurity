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

  it("422s an address outside the subnet CIDR", async () => {
    const r = await call("POST", "/ip-addresses", { subnetId, address: "10.97.0.5" });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("not inside subnet");
  });

  it("422s a patch that moves the address outside the CIDR", async () => {
    const r = await call("PATCH", `/ip-addresses/${ipId}`, { address: "10.97.0.5" });
    expect(r.status).toBe(422);
    const ok = await call("PATCH", `/ip-addresses/${ipId}`, { address: "10.96.0.11" });
    expect(ok.status).toBe(200);
    expect(ok.body.address).toBe("10.96.0.11");
    // Restore the address the reclaim test below depends on.
    expect((await call("PATCH", `/ip-addresses/${ipId}`, { address: "10.96.0.10" })).status).toBe(200);
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

describe("import scan findings onto devices", () => {
  let deviceId: number;
  let registeredIpId: number;
  let runId: number;
  let openFindingId: number;
  const REGISTERED_IP = "10.94.0.10";
  const UNREGISTERED_IP = "10.94.0.99";

  // The scanner is the only findings writer, so fixtures go straight into the DB.
  async function insertFinding(ip: string, port: number, state: string, service: string | null) {
    const [res] = await pool.query(
      "INSERT INTO scan_findings (run_id, ip_address, port, protocol, state, service) VALUES (?, ?, ?, 'tcp', ?, ?)",
      [runId, ip, port, state, service],
    );
    return (res as { insertId: number }).insertId;
  }

  beforeAll(async () => {
    const s = await call("POST", "/subnets", { name: "Import test net", cidr: "10.94.0.0/24" });
    const d = await call("POST", "/devices", { hostname: "import-host" });
    deviceId = d.body.id;
    const ip = await call("POST", "/ip-addresses", { subnetId: s.body.id, deviceId, address: REGISTERED_IP });
    registeredIpId = ip.body.id;
    const sched = await call("POST", "/schedules", {
      name: "Import test sweep", targetType: "subnet", subnetId: s.body.id,
      nextRunAtUTC: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const [run] = await pool.query(
      "INSERT INTO scan_runs (schedule_id, scheduled_for_UTC, status) VALUES (?, UTC_TIMESTAMP(), 'completed')",
      [sched.body.id],
    );
    runId = (run as { insertId: number }).insertId;
    openFindingId = await insertFinding(REGISTERED_IP, 22, "open", "ssh");
    await insertFinding(REGISTERED_IP, 80, "open", null);
    await insertFinding(UNREGISTERED_IP, 443, "open", "https");
    await insertFinding(REGISTERED_IP, 23, "closed", null);
  });

  it("bulk import creates ports for matched IPs and reports the rest", async () => {
    const r = await call("POST", `/scan-runs/${runId}/import-findings`, {});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      imported: 2, updated: 0, skippedState: 1, skippedUnmatched: [UNREGISTERED_IP],
    });
    const ports = await call("GET", `/device-ports?deviceId=${deviceId}`);
    const ssh = ports.body.data.find((p: { port: number }) => p.port === 22);
    expect(ssh.source).toBe("scan");
    expect(ssh.service).toBe("ssh");
    expect(ssh.lastSeenAtUTC).not.toBeNull();
    expect(ssh.ipAddressId).toBe(registeredIpId);
    expect(ports.body.data.some((p: { port: number }) => p.port === 443)).toBe(false);
  });

  it("re-import updates instead of duplicating", async () => {
    const r = await call("POST", `/scan-runs/${runId}/import-findings`, {});
    expect(r.body.imported).toBe(0);
    expect(r.body.updated).toBe(2);
    const ports = await call("GET", `/device-ports?deviceId=${deviceId}`);
    expect(ports.body.data.filter((p: { port: number }) => p.port === 22).length).toBe(1);
  });

  it("imports a single finding by id", async () => {
    const r = await call("POST", `/scan-runs/${runId}/import-findings`, { findingIds: [openFindingId] });
    expect(r.body).toEqual({ imported: 0, updated: 1, skippedState: 0, skippedUnmatched: [] });
  });

  it("404s an unknown finding id or run id", async () => {
    expect((await call("POST", `/scan-runs/${runId}/import-findings`, { findingIds: [999999] })).status).toBe(404);
    expect((await call("POST", "/scan-runs/999999/import-findings", {})).status).toBe(404);
  });

  it("409s a manual duplicate on the same IP; allows the same port device-wide", async () => {
    const dup = await call("POST", "/device-ports", { deviceId, port: 22, protocol: "tcp", ipAddressId: registeredIpId });
    expect(dup.status).toBe(409);
    // Device-wide (no IP binding) coexists with the ip-bound row by design.
    const wide = await call("POST", "/device-ports", { deviceId, port: 22, protocol: "tcp" });
    expect(wide.status).toBe(200);
    expect(wide.body.ipAddressId).toBeNull();
  });

  it("manual registration defaults to source=manual with no last-seen", async () => {
    const r = await call("POST", "/device-ports", { deviceId, port: 8080, service: "grafana", notes: "container app" });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("manual");
    expect(r.body.lastSeenAtUTC).toBeNull();
  });
});

describe("ip-bound device ports", () => {
  let deviceId: number;
  let otherDeviceId: number;
  let ip1Id: number;
  let ip2Id: number;
  let otherIpId: number;
  let runId: number;

  beforeAll(async () => {
    const s = await call("POST", "/subnets", { name: "IP-bound test net", cidr: "10.93.0.0/24" });
    const d = await call("POST", "/devices", { hostname: "ipbound-host" });
    deviceId = d.body.id;
    const o = await call("POST", "/devices", { hostname: "ipbound-other" });
    otherDeviceId = o.body.id;
    ip1Id = (await call("POST", "/ip-addresses", { subnetId: s.body.id, deviceId, address: "10.93.0.20" })).body.id;
    ip2Id = (await call("POST", "/ip-addresses", { subnetId: s.body.id, deviceId, address: "10.93.0.21" })).body.id;
    otherIpId = (await call("POST", "/ip-addresses", { subnetId: s.body.id, deviceId: otherDeviceId, address: "10.93.0.30" })).body.id;
    const sched = await call("POST", "/schedules", {
      name: "IP-bound test sweep", targetType: "subnet", subnetId: s.body.id,
      nextRunAtUTC: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const [run] = await pool.query(
      "INSERT INTO scan_runs (schedule_id, scheduled_for_UTC, status) VALUES (?, UTC_TIMESTAMP(), 'completed')",
      [sched.body.id],
    );
    runId = (run as { insertId: number }).insertId;
  });

  it("import claims a pre-existing device-wide port and binds it to the scanned IP", async () => {
    const wide = await call("POST", "/device-ports", { deviceId, port: 8443, protocol: "tcp" });
    expect(wide.status).toBe(200);
    expect(wide.body.ipAddressId).toBeNull();
    await pool.query(
      "INSERT INTO scan_findings (run_id, ip_address, port, protocol, state, service) VALUES (?, '10.93.0.20', 8443, 'tcp', 'open', 'https-alt')",
      [runId],
    );
    const r = await call("POST", `/scan-runs/${runId}/import-findings`, {});
    expect(r.body).toEqual({ imported: 0, updated: 1, skippedState: 0, skippedUnmatched: [] });
    const row = await call("GET", `/device-ports/${wide.body.id}`);
    expect(row.body.ipAddressId).toBe(ip1Id);
    expect(row.body.lastSeenAtUTC).not.toBeNull();
  });

  it("allows the same port on two different IPs of one device", async () => {
    expect((await call("POST", "/device-ports", { deviceId, port: 9000, ipAddressId: ip1Id })).status).toBe(200);
    expect((await call("POST", "/device-ports", { deviceId, port: 9000, ipAddressId: ip2Id })).status).toBe(200);
  });

  it("422s an IP binding that belongs to another device", async () => {
    expect((await call("POST", "/device-ports", { deviceId, port: 1234, ipAddressId: otherIpId })).status).toBe(422);
    expect((await call("POST", "/device-ports", { deviceId, port: 1234, ipAddressId: 999999 })).status).toBe(422);
    const bound = await call("GET", `/device-ports?ipAddressId=${ip1Id}`);
    const portId = bound.body.data[0].id;
    expect((await call("PATCH", `/device-ports/${portId}`, { ipAddressId: otherIpId })).status).toBe(422);
    // Re-pointing the device while an IP binding exists must also fail.
    expect((await call("PATCH", `/device-ports/${portId}`, { deviceId: otherDeviceId })).status).toBe(422);
  });

  it("filters by ipAddressId, optionally unioned with device-wide rows", async () => {
    await call("POST", "/device-ports", { deviceId, port: 7000 }); // device-wide
    const bound = await call("GET", `/device-ports?ipAddressId=${ip1Id}`);
    expect(bound.body.data.length).toBe(2); // claimed 8443 + 9000 on ip1
    expect(bound.body.data.every((p: { ipAddressId: number }) => p.ipAddressId === ip1Id)).toBe(true);
    const union = await call("GET", `/device-ports?deviceId=${deviceId}&ipAddressId=${ip1Id}&includeDeviceWide=true`);
    const ports = union.body.data.map((p: { port: number }) => p.port).sort();
    expect(ports).toEqual([7000, 8443, 9000]);
    expect((await call("GET", `/device-ports?ipAddressId=${ip1Id}&includeDeviceWide=true`)).status).toBe(422);
  });

  it("409s restore when the (device, ip, port, protocol) slot was reclaimed", async () => {
    const bound = await call("GET", `/device-ports?ipAddressId=${ip2Id}`);
    const portId = bound.body.data[0].id;
    expect((await call("POST", `/device-ports/${portId}/archive`)).status).toBe(200);
    const again = await call("POST", "/device-ports", { deviceId, port: 9000, ipAddressId: ip2Id });
    expect(again.status).toBe(200);
    expect((await call("POST", `/device-ports/${portId}/restore`)).status).toBe(409);
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
