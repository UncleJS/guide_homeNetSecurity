function ipv4ToInt(address: string): number | null {
  const m = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

// Whether an IPv4 address falls inside a CIDR block. Returns null when either
// side is IPv6 / unparseable — callers should skip the check in that case.
export function ipv4InCidr(address: string, cidr: string): boolean | null {
  const m = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!m) return null;
  const prefix = Number(m[2]);
  if (prefix > 32) return null;
  const base = ipv4ToInt(m[1]);
  const addr = ipv4ToInt(address);
  if (base === null || addr === null) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (addr & mask) >>> 0 === (base & mask) >>> 0;
}

// Usable IPv4 host count from a CIDR. Returns null for IPv6 / unparseable input.
export function ipv4Capacity(cidr: string): number | null {
  const m = cidr.match(/^\d+\.\d+\.\d+\.\d+\/(\d+)$/);
  if (!m) return null;
  const prefix = Number(m[1]);
  if (prefix < 0 || prefix > 32) return null;
  if (prefix >= 31) return 2 ** (32 - prefix); // /31, /32 have no network/broadcast reservation
  return 2 ** (32 - prefix) - 2;
}
