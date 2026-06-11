import { describe, expect, it } from "bun:test";
import { ipv4Capacity } from "../src/lib/net.ts";
import { paginate } from "../src/lib/util.ts";
import { DEFAULT_HARDENING_CONTROLS } from "../src/lib/hardening.ts";
import { buildPortArgs, buildNmapArgs, countPorts, isValidPortSpec, parseGrepable } from "../src/lib/scanner.ts";
import { advance } from "../src/lib/scheduler.ts";
import { ipv4InCidr } from "../src/lib/net.ts";

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

  it("always declares unprivileged mode (rootless pod has no CAP_NET_RAW)", () => {
    expect(buildNmapArgs(["192.168.1.5"], "top100", true)).toContain("--unprivileged");
    expect(buildNmapArgs(["192.168.1.0/24"], "top100", false)).toContain("--unprivileged");
  });

  it("counts ports in a spec", () => {
    expect(countPorts("top100")).toBe(100);
    expect(countPorts("top1000")).toBe(1000);
    expect(countPorts("22,80,443")).toBe(3);
    expect(countPorts("1-65535")).toBe(65535);
    expect(countPorts("1-1024,8080")).toBe(1025);
  });

  it("caps parallelism so pasta's flow table is not saturated", () => {
    const args = buildNmapArgs(["192.168.1.5"], "1-65535", true);
    expect(args.join(" ")).toContain("--max-parallelism 32");
  });

  it("scales host-timeout with the number of ports", () => {
    expect(buildNmapArgs(["192.168.1.5"], "top100", true).join(" ")).toContain("--host-timeout 90s");
    expect(buildNmapArgs(["192.168.1.5"], "1-65535", true).join(" ")).toContain("--host-timeout 1311s");
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

  it("dedupes a host scanned via duplicate targets", () => {
    // Same address allocated twice -> nmap scans the host once per target and
    // repeats its Status/Ports lines verbatim.
    const dup = [
      "Host: 192.168.10.41 (cent01w)\tStatus: Up",
      "Host: 192.168.10.41 (cent01w)\tPorts: 3306/open/tcp//mysql///, 11290/open/tcp/////, 11291/open/tcp/////",
      "Host: 192.168.10.41 (cent01w)\tStatus: Up",
      "Host: 192.168.10.41 (cent01w)\tPorts: 3306/open/tcp//mysql///, 11290/open/tcp/////, 11291/open/tcp/////",
    ].join("\n");
    const { hostsUp, findings } = parseGrepable(dup);
    expect(hostsUp).toBe(1);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.port)).toEqual([3306, 11290, 11291]);
  });
});

describe("ipv4InCidr", () => {
  it("accepts addresses inside the block", () => {
    expect(ipv4InCidr("192.168.10.41", "192.168.10.0/24")).toBe(true);
    expect(ipv4InCidr("10.96.0.1", "10.96.0.0/16")).toBe(true);
    expect(ipv4InCidr("10.0.0.5", "0.0.0.0/0")).toBe(true);
    expect(ipv4InCidr("172.16.5.9", "172.16.5.9/32")).toBe(true);
  });

  it("rejects addresses outside the block", () => {
    expect(ipv4InCidr("192.168.10.41", "192.168.40.0/24")).toBe(false);
    expect(ipv4InCidr("10.97.0.5", "10.96.0.0/24")).toBe(false);
    expect(ipv4InCidr("172.16.5.10", "172.16.5.9/32")).toBe(false);
  });

  it("returns null for IPv6 or unparseable input", () => {
    expect(ipv4InCidr("fd00::1", "192.168.10.0/24")).toBeNull();
    expect(ipv4InCidr("192.168.10.41", "fd00::/64")).toBeNull();
    expect(ipv4InCidr("not-an-ip", "192.168.10.0/24")).toBeNull();
    expect(ipv4InCidr("192.168.10.999", "192.168.10.0/24")).toBeNull();
    expect(ipv4InCidr("192.168.10.41", "192.168.10.0/33")).toBeNull();
  });
});
