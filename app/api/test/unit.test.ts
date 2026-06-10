import { describe, expect, it } from "bun:test";
import { ipv4Capacity } from "../src/lib/net.ts";
import { paginate } from "../src/lib/util.ts";
import { DEFAULT_HARDENING_CONTROLS } from "../src/lib/hardening.ts";

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
