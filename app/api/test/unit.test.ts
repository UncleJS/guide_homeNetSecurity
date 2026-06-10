import { describe, expect, it } from "bun:test";
import { ipv4Capacity } from "../src/lib/net.ts";
import { paginate } from "../src/lib/util.ts";
import { DEFAULT_HARDENING_CONTROLS } from "../src/lib/hardening.ts";
import { buildPortArgs, buildNmapArgs, isValidPortSpec, parseGrepable } from "../src/lib/scanner.ts";
import { advance } from "../src/lib/scheduler.ts";

describe("ipv4Capacity", () => {
  it("computes usable hosts for common prefixes", () => {
    expect(ipv4Capacity("192.168.1.0/24")).toBe(254);
    expect(ipv4Capacity("10.0.0.0/16")).toBe(65534);
    expect(ipv4Capacity("192.168.1.0/30")).toBe(2);
    expect(ipv4Capacity("192.168.1.1/32")).toBe(1);
  });
  it("returns null for IPv6 / garbage", () => {
    expect(ipv4Capacity("fd00::/64")).toBeNull();
    expect(ipv4Capacity("not-a-cidr")).toBeNull();
    expect(ipv4Capacity("1.2.3.4/40")).toBeNull();
  });
});

describe("paginate", () => {
  it("defaults to page 1, size 50", () => {
    expect(paginate({})).toMatchObject({ page: 1, pageSize: 50, offset: 0, limit: 50 });
  });
  it("clamps pageSize to 200 and page to >=1", () => {
    expect(paginate({ page: 0, pageSize: 9999 })).toMatchObject({ page: 1, pageSize: 200 });
  });
  it("computes offset from page", () => {
    expect(paginate({ page: 3, pageSize: 10 }).offset).toBe(20);
  });
});

describe("default hardening checklist", () => {
  it("seeds the baseline controls", () => {
    expect(DEFAULT_HARDENING_CONTROLS.length).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_HARDENING_CONTROLS).toContain("Changed default/admin credentials");
  });
});

describe("advance (scan recurrence)", () => {
  const at = (iso: string) => new Date(iso);

  it("steps daily and weekly", () => {
    expect(advance(at("2026-06-10T08:00:00Z"), "daily").toISOString()).toBe("2026-06-11T08:00:00.000Z");
    expect(advance(at("2026-06-10T08:00:00Z"), "weekly").toISOString()).toBe("2026-06-17T08:00:00.000Z");
  });

  it("clamps the day-of-month for monthly", () => {
    expect(advance(at("2026-01-31T08:00:00Z"), "monthly").toISOString()).toBe("2026-02-28T08:00:00.000Z");
    expect(advance(at("2024-01-31T08:00:00Z"), "monthly").toISOString()).toBe("2024-02-29T08:00:00.000Z"); // leap year
    expect(advance(at("2026-03-15T08:00:00Z"), "monthly").toISOString()).toBe("2026-04-15T08:00:00.000Z");
  });

  it("steps quarterly with clamping", () => {
    expect(advance(at("2026-11-30T08:00:00Z"), "quarterly").toISOString()).toBe("2027-02-28T08:00:00.000Z");
    expect(advance(at("2026-01-10T08:00:00Z"), "quarterly").toISOString()).toBe("2026-04-10T08:00:00.000Z");
  });
});

describe("port specs", () => {
  it("maps presets to nmap args", () => {
    expect(buildPortArgs("top100")).toEqual(["--top-ports", "100"]);
    expect(buildPortArgs("top1000")).toEqual(["--top-ports", "1000"]);
    expect(buildPortArgs("1-1024")).toEqual(["-p", "1-1024"]);
    expect(buildPortArgs("22,80,443")).toEqual(["-p", "22,80,443"]);
  });

  it("rejects anything that is not a plain port list", () => {
    expect(isValidPortSpec("1;rm -rf /")).toBe(false);
    expect(isValidPortSpec("22 80")).toBe(false);
    expect(() => buildPortArgs("1;rm")).toThrow();
  });

  it("adds -Pn only for single-host scans", () => {
    expect(buildNmapArgs(["192.168.1.5"], "top100", true)).toContain("-Pn");
    expect(buildNmapArgs(["192.168.1.0/24"], "top100", false)).not.toContain("-Pn");
  });
});

describe("parseGrepable", () => {
  const SAMPLE = [
    "# Nmap 7.94 scan initiated",
    "Host: 192.168.1.1 ()\tStatus: Up",
    "Host: 192.168.1.1 ()\tPorts: 53/open/tcp//domain///, 80/open/tcp//http///, 443/closed/tcp//https///\tIgnored State: filtered (97)",
    "Host: 192.168.1.10 (nas.lan)\tStatus: Up",
    "Host: 192.168.1.10 (nas.lan)\tPorts: 22/open/tcp//ssh///\tIgnored State: closed (99)",
    "# Nmap done",
  ].join("\n");

  it("keeps only open ports and counts hosts up", () => {
    const { hostsUp, findings } = parseGrepable(SAMPLE);
    expect(hostsUp).toBe(2);
    expect(findings).toHaveLength(3);
    expect(findings[0]).toMatchObject({ ipAddress: "192.168.1.1", hostname: null, port: 53, protocol: "tcp", service: "domain" });
    expect(findings[2]).toMatchObject({ ipAddress: "192.168.1.10", hostname: "nas.lan", port: 22, service: "ssh" });
  });

  it("returns empty for output with no port lines", () => {
    expect(parseGrepable("# Nmap done: 0 hosts up")).toEqual({ hostsUp: 0, findings: [] });
  });
});
